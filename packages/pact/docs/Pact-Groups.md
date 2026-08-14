# Groups

Resolve a principal's permissions through the groups it belongs to. PACT owns
no group storage — you supply a resolver hook, and PACT caches its results, ORs
grants across a principal's groups (plus optional direct grants), and re-syncs
on demand or on a timer.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [How groups work](#how-groups-work)
- [Configuring a resolver](#configuring-a-resolver)
- [The resolver hook](#the-resolver-hook)
- [Checking a permission across groups](#checking-a-permission-across-groups)
- [Combining grants](#combining-grants)
- [OR semantics](#or-semantics)
- [Lazy resolution and caching](#lazy-resolution-and-caching)
- [Keeping the cache fresh](#keeping-the-cache-fresh)
- [The grants wire codec](#the-grants-wire-codec)
- [Errors](#errors)
- [Related](#related)

## How groups work

PACT never creates, updates, or deletes groups — group membership and the
group-to-grants mapping are entirely yours. You provide a `groupResolver` hook
that fetches the grants for a set of group ids; PACT then:

- resolves an unknown group **lazily** on first use and **caches** the result,
- **ORs** the grants of every group a principal belongs to (plus optional
  per-principal `direct` grants) into a single mask set, and
- **re-syncs** the cache on demand (`syncGroups()`) or on a timer
  (`syncInterval`).

Because grants are just BigInt bitmasks, "belongs to more than one group" is a
bitwise OR — there is no group hierarchy, precedence, or deny rule to reason
about.

## Configuring a resolver

Set `groupResolver` (required for every group method) and, optionally,
`syncInterval` (milliseconds; `0` disables the timer):

```typescript
import { PACT } from '@tundralibs/pact';
import type { PACTGrants } from '@tundralibs/pact';

declare const db: {
  grantsForGroups(ids: string[]): Promise<Record<string, PACTGrants>>;
};

const pact = new PACT({
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
  modules: { Post: ['READ', 'EDIT', 'DELETE'] },
  // Consumer-owned: return { [groupId]: { module: mask } } for the ids asked for.
  groupResolver: (groupIds) => db.grantsForGroups(groupIds),
  // Optional: auto re-sync every cached group every 5 minutes (0 = off).
  syncInterval: 300_000,
});
```

When `syncInterval > 0`, PACT starts the re-sync timer at construction. The
timer is unref'd, so it never keeps the process alive.

## The resolver hook

The hook signature is
`(groupIds: string[]) => Promise<Record<string, PACTGrants>>`, where
`PACTGrants` is `Record<string, bigint>` (module name → combined mask). Map each
requested id to its grants; **ids you omit from the result are cached as having
no grants** (`{}`), so they are not re-fetched on every check.

```typescript
import { PACT } from '@tundralibs/pact';
import type { GroupResolver, PACTGrants } from '@tundralibs/pact';

declare const db: {
  grantRowsFor(id: string): Promise<Array<{ module: string; mask: string }>>;
};

const groupResolver: GroupResolver = async (groupIds) => {
  const result: Record<string, PACTGrants> = {};
  for (const id of groupIds) {
    const rows = await db.grantRowsFor(id); // your storage: [{ module, mask }]
    for (const { module, mask } of rows) {
      (result[id] ??= {})[module] = BigInt(mask);
    }
  }
  return result; // e.g. { editors: { Post: 3n }, billing: { Billing: 1n } }
};

const pact = new PACT({
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
  modules: { Post: ['READ', 'EDIT', 'DELETE'], Billing: ['READ'] },
  groupResolver,
});
```

## Checking a permission across groups

`hasPermissionForGroups(module, permission, groupIds, direct?)` resolves (and
caches) the listed groups, ORs their grants, and returns whether the result
includes `permission` on `module`. Pass **all** of the principal's group ids —
any single group that grants the permission grants it. The optional `direct`
argument adds per-principal grants that OR in the same way (shown under
[Combining grants](#combining-grants)).

```typescript
import { PACT } from '@tundralibs/pact';

// given the `pact` configured above
declare const pact: PACT;
declare const user: { id: string; groupIds: string[] };

const allowed = await pact.hasPermissionForGroups(
  'Post',
  'EDIT',
  user.groupIds, // e.g. ['editors', 'contributors']
);
```

## Combining grants

When you need the actual mask set — to run several checks, or to embed it in a
token — call `grantsForGroups(groupIds, direct?)`. It returns the OR of every
listed group's grants merged with the optional `direct` per-principal grants, as
a `PACTGrants` map you can reuse.

```typescript
import { PACT } from '@tundralibs/pact';

declare const pact: PACT;
declare const user: { id: string; groupIds: string[] };

const grants = await pact.grantsForGroups(user.groupIds, {
  Post: 4n, // a direct DELETE grant on top of the group grants
});

pact.can('Post', 'DELETE', grants); // true (from `direct`)
pact.can('Post', 'EDIT', grants); // true if any group grants EDIT
```

## OR semantics

Every combination is a bitwise OR: a principal in several groups receives the
**union** of those groups' grants, and `direct` grants OR in the same way.
Grants are allow-only — no group can remove a bit another group (or a direct
grant) provides.

```typescript
import { PACT } from '@tundralibs/pact';

declare const pact: PACT;

// Suppose the resolver returns:
//   editors → { Post: 3n }     (READ | EDIT)
//   billing → { Billing: 1n }  (READ)
// and you pass direct → { Post: 4n } (DELETE):
const grants = await pact.grantsForGroups(['editors', 'billing'], {
  Post: 4n,
});
// grants === { Post: 7n, Billing: 1n }
//   Post 7n = READ | EDIT | DELETE  (3n from editors OR 4n direct)
```

## Lazy resolution and caching

A group is fetched **once**. The first check that references an unknown id calls
the resolver; the result is cached and reused. The resolver is not called again
for that id until a sync. This makes repeated checks cheap, but means grant
changes on your side are not visible until you re-sync.

```typescript
import { PACT } from '@tundralibs/pact';

declare const pact: PACT;

// First call resolves 'editors' through the resolver and caches it.
await pact.hasPermissionForGroups('Post', 'EDIT', ['editors']);

// Second call reuses the cache — the resolver is NOT called again.
await pact.hasPermissionForGroups('Post', 'READ', ['editors']);
```

## Keeping the cache fresh

The cache is a snapshot; re-sync to pick up changes to your group grants:

- **`syncGroups(groupIds?)`** — manually re-fetch through the resolver,
  replacing cached values. Defaults to every cached group; pass ids to refresh
  just those. Returns the ids that were refreshed and emits `sync` when at least
  one was. A resolver error throws to the caller.
- **`syncInterval`** — when set (ms), PACT runs the equivalent of
  `syncGroups()` on an unref'd timer. If a timer-driven sync throws, PACT emits
  `syncFailed` instead of throwing.
- **`stopSync()`** — halt the timer (safe to call repeatedly).

```typescript
import { PACT } from '@tundralibs/pact';
import type { PACTGrants } from '@tundralibs/pact';

declare const db: {
  grantsForGroups(ids: string[]): Promise<Record<string, PACTGrants>>;
};

const pact = new PACT({
  bits: { READ: 1n, EDIT: 2n },
  groupResolver: (ids) => db.grantsForGroups(ids),
  syncInterval: 60_000, // auto re-sync every minute
  _onsync: (ids) => console.log('re-synced groups', ids),
  _onsyncFailed: (err) => console.error('group sync failed', err),
});

// Force an immediate refresh after you change a group's grants:
await pact.syncGroups(['editors']);

// Stop the periodic timer (e.g. on shutdown):
pact.stopSync();
```

The cache itself is the exported `Groups` class (the facade composes one);
hold your own instance when you want direct control over it. Its `clear()`
drops every cached group, so the next use re-resolves — use it as a
revocation signal. A resolve that was already in flight when `clear()` ran
carries pre-clear values, so they are never written to the cache; that call
re-resolves and returns the post-clear grants instead. A permission check
racing a `clear()` therefore never sees an empty grants map (which would
deny by default) and never sees resurrected, revoked grants.

`ensure()` upholds the same guarantee from the caching side: it caches
**every** requested id even when a `clear()` lands mid-resolve — including a
`clear()` that evicts an id which was already cached when the call began. Such
an id is re-resolved rather than left un-cached, so `ensure()` never returns
having cached only some of the ids it was asked to resolve.

```typescript
import { Groups } from '@tundralibs/pact';
import type { PACTGrants } from '@tundralibs/pact';

declare const db: {
  grantsForGroups(ids: string[]): Promise<Record<string, PACTGrants>>;
};

const groups = new Groups((ids) => db.grantsForGroups(ids));
await groups.ensure(['editors']); // resolve + cache
groups.cached; // ['editors']
groups.clear(); // revocation: force a fresh resolve on next use
```

## The grants wire codec

`PACTGrants` masks are BigInts, which are **not JSON-serializable**, so grants
embedded in a JWT (or any wire format) travel as decimal strings — serialize
before embedding, deserialize after verifying.

- **`serializeGrants(grants)`** → `Record<string, string>` — each mask as a
  decimal string.
- **`deserializeGrants(wire)`** → `PACTGrants` — accepts decimal strings (the
  serialized form), non-negative integer numbers, or BigInts.

```typescript
import { deserializeGrants, PACT, serializeGrants } from '@tundralibs/pact';

declare const pact: PACT;
declare const user: { id: string; groupIds: string[] };

const grants = await pact.grantsForGroups(user.groupIds);

// Embed in a JWT — masks become decimal strings.
const token = await pact.generateJWT({
  sub: user.id,
  grants: serializeGrants(grants), // { Post: "7", Billing: "1" }
});

// After verifying, rebuild the BigInt masks before checking.
const claims = await pact.verifyJWT(token);
const restored = deserializeGrants(claims.grants as Record<string, string>);
pact.can('Post', 'EDIT', restored);
```

`combineGrants(...sets)` is the OR-merge primitive behind `grantsForGroups`.
Hand it any number of `PACTGrants` sets (it skips `undefined`) to union them
yourself — for example, layering tenant- or role-level grants on top of group
grants:

```typescript
import { combineGrants } from '@tundralibs/pact';
import type { PACTGrants } from '@tundralibs/pact';

declare const directGrants: PACTGrants;
declare const tenantGrants: PACTGrants;
declare const roleGrants: PACTGrants;

const merged = combineGrants(directGrants, tenantGrants, roleGrants);
// Later sets only ever add bits — grants are allow-only.
```

## Errors

- Every group method — `hasPermissionForGroups`, `grantsForGroups`, and
  `syncGroups` — throws `PactDefinitionError` with code `MISSING_OPTION` when no
  `groupResolver` is configured. Configure the hook, or don't call the group
  methods.
- `deserializeGrants` throws `PactDefinitionError` with code `INVALID_GRANTS`
  when a value is not a non-negative decimal integer (it rejects `''`,
  hex/octal/binary literals, floats, and negatives).

```typescript
import { PACT, PactDefinitionError } from '@tundralibs/pact';

const pact = new PACT({ bits: { READ: 1n } }); // no groupResolver

try {
  await pact.grantsForGroups(['editors']);
} catch (err) {
  if (err instanceof PactDefinitionError) {
    console.error(err.code); // 'MISSING_OPTION'
  }
}
```

## Related

- [Authorization](./Pact-Authorization.md) — the bitmask permission model and
  the `can`/`assert` checks that grants feed into.
- [Tokens](./Pact-Tokens.md) — issuing and verifying JWTs, where serialized
  grants are typically embedded.

---

[← Back to Pact](../README.md)
