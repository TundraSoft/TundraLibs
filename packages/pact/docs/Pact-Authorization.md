# Authorization — BigInt bitmask permissions

Authorization is coarse-grained `module × action` over unbounded BigInt
masks. A principal carries its **effective** grants (module → mask); a
check is one bitwise AND.

## Registry and catalog

```typescript
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  // the registry: permission name → bit (BigInt, so no 31-bit ceiling)
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n },
  // the optional catalog: which permissions apply to which module.
  // With it, an unknown module or inapplicable permission THROWS a
  // PactDefinitionError — typos become config errors, not denials.
  modules: { Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'], Billing: ['READ'] },
});

declare const principal: Parameters<typeof pact.can>[0];
pact.can(principal, 'Post', 'EDIT'); // boolean
pact.assert(principal, 'Post', 'DELETE'); // throws PactDeniedError (emits `denied`)
```

`can`/`assert` gate on the principal too: `null` or a non-`ACTIVE`
status is always a deny.

**Empty requirements fail closed.** A check that requires _no_ permissions — a
raw `0n`, `toMask(m, [])` (which is `0n`), or an empty `any([])`/`all([])` — is
almost always a bug (a filtered-to-empty scope list, a missing permission), so
`has`/`assert`/`any`/`all` **throw `EMPTY_REQUIREMENT`** rather than silently
satisfy it. Guard your own empty case before building a required mask.

This live gate only bites when `verify()` re-resolves the user each request.
With [`session.embedGrants`](Pact-Sessions.md) the principal is rebuilt from
the token, so both its grants and its `status` are frozen until the token
expires — a `LOCKED` user keeps their access, and a role you downgraded keeps
its old bits, for the token's whole lifetime. The embedded principal also
carries a hardcoded `status: 'ACTIVE'` and an **empty `metadata`** (not the real
user's), so do not key authorization or tenancy on `principal.metadata` under
`embedGrants`. Likewise, emptying a group or revoking a role updates future
`getUser` results but does **not** invalidate embedded-grant tokens already
minted. Embed only with a short `ttl`, or resolve fresh when authority must be
current.

## The app composes effective grants

pact has **no group layer** — group/role/team membership is domain
modeling that varies per app. Your `getUser` hook returns the flattened
result; the mask algebra makes composing it a one-liner:

```typescript
import { combineGrants, serializeGrants } from '@tundralibs/pact/authz';

declare const userGrants: { Post: bigint };
declare const groupGrants: Array<Record<string, bigint>>;

const effective = combineGrants(userGrants, ...groupGrants); // OR-merge
const wire = serializeGrants(effective); // masks → decimal strings
```

Grants travel as decimal strings (`serializeGrants` /
`deserializeGrants`) because BigInt is not JSON-serializable — the same
choice Discord makes for its permission bitfields.

## The `./authz` subpath

`@tundralibs/pact/authz` exports the pure core — the `Permissions` engine
and the grants codec — with **zero** crypto, network, or hook machinery.
It is safe to import in the browser (permission-editor UIs, mask
tooling) and in authorization-only services.

```typescript
import { Permissions } from '@tundralibs/pact/authz';

const perms = new Permissions(
  { READ: 1n, EDIT: 2n, DELETE: 4n },
  { Post: ['READ', 'EDIT', 'DELETE'] },
);
perms.has('Post', 'EDIT', { Post: 3n }); // true
perms.toNames('Post', 3n); // ['READ', 'EDIT'] — render a mask as checkboxes
perms.toMask('Post', ['READ', 'DELETE']); // 5n — encode the edited state
perms.diff(3n, 6n); // { added: 4n, removed: 1n } — audit a change
perms.grant(0n, 'READ', 'EDIT'); // 3n
perms.revoke(7n, 'EDIT'); // 5n
```

The engine on a `Pact` instance is reachable as `pact.authz` — same
object, for when you already hold the engine.

Multiple registries are cheap: a `Permissions` is validated config +
arithmetic, so per-tenant permission vocabularies or a v1/v2 registry
migration are just two instances side by side.

## What stays out

Per-instance / attribute rules ("edit **this** post") are app logic —
check ownership in your handler after `assert`. Policy DSLs and
relationship stores are deliberately out of scope: the bitmask IS the
model, and storage only ever holds _which mask a principal has_.
