# Authorization

PACT's authorization core: permissions are BigInt bitmasks scoped by module,
a principal's grants are a `module → mask` map, and every check is a bitwise
test. The `PACT` facade and the standalone `Permissions` engine share the
exact same model.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [The bitmask model](#the-bitmask-model)
- [Why BigInt](#why-bigint)
- [Modules and validation](#modules-and-validation)
- [Grants](#grants)
- [Checking permissions](#checking-permissions)
- [Enforcing with assert](#enforcing-with-assert)
- [Mask math](#mask-math)
- [Authorization-only: the Permissions class](#authorization-only-the-permissions-class)
- [The coarse-grained boundary](#the-coarse-grained-boundary)

## The bitmask model

Each action is a single bit. The **registry** (`bits`) maps a permission name
to its BigInt bit; a **grant** for a module is the bitwise-OR of the bits a
principal holds there. Bits must be positive and unique — typically `1n << n`.

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  // the registry: each action is one bit
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n },
  // the catalog: which actions apply to which module (optional)
  modules: {
    Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'],
    Billing: ['READ'],
  },
});

// a grant mask is the OR of the action bits held
const editor = 1n | 2n; // READ | EDIT === 3n
```

`bits` is the only required option — omitting it throws `PactDefinitionError`
(`MISSING_OPTION`). A registry whose bits are non-positive or collide is
rejected at construction (`INVALID_PERMISSION_BIT` / `DUPLICATE_PERMISSION_BIT`).

## Why BigInt

Permission bits are `bigint`, not `number`, on purpose. JavaScript's bitwise
operators coerce their operands to **32-bit signed** integers, so a `number`
mask runs out of room at 31 usable bits — 31 actions per module, and bit 31
flips the sign. BigInt is unbounded: a registry can hold as many permissions
as you like, and `&` / `|` / `~` stay exact well past bit 31.

```typescript
import { PACT } from '@tundralibs/pact';

1 << 31; // -2147483648  — number silently overflows into the sign bit
1n << 31n; // 2147483648n — the BigInt equivalent is exact
1n << 99n; // 633825300114114700748351602688n — and unbounded
```

## Modules and validation

The `modules` catalog maps a module to the permission names that apply to it.
It is **optional**, but when present it turns typos into thrown errors: a check
against an undeclared module or an inapplicable permission throws
`PactDefinitionError` instead of silently returning `false`.

```typescript
import { PACT } from '@tundralibs/pact';
// pact configured as in "The bitmask model" above

pact.can('Ghost', 'READ', {}); // throws PactDefinitionError — UNKNOWN_MODULE
pact.can('Billing', 'EDIT', {}); // throws PactDefinitionError — PERMISSION_NOT_IN_MODULE
```

A permission name absent from the registry throws `UNKNOWN_PERMISSION` whether
or not a catalog is configured. Without a catalog (`new PACT({ bits })`) no
module/applicability validation runs — any module name is accepted and grants
default to `0n`. The catalog is what makes `module × action` a checked surface.

## Grants

A principal's grants are a plain `module → mask` map (the `PACTGrants` type) —
the combined BigInt mask they hold on each module. This is the shape every
check takes as its last argument. PACT never stores it; you resolve it from
your own data or from a token.

```typescript
import { PACT } from '@tundralibs/pact';

const grants = {
  Post: 3n, // READ | EDIT
  Billing: 1n, // READ
};
```

## Checking permissions

Four checks answer with a boolean instead of throwing on a denial. `can` is an
alias of `hasPermission`; `canAny` / `canAll` fold a list with OR / AND
semantics.

```typescript
import { PACT } from '@tundralibs/pact';
// pact configured as in "The bitmask model" above

const grants = { Post: 3n }; // READ | EDIT

pact.can('Post', 'EDIT', grants); // true
pact.hasPermission('Post', 'DELETE', grants); // false
pact.canAny('Post', ['DELETE', 'EDIT'], grants); // true  — holds EDIT
pact.canAll('Post', ['READ', 'DELETE'], grants); // false — missing DELETE
```

## Enforcing with assert

`assert` is the throwing gate: it returns `void` when the grant holds and
throws `PactDeniedError` (code `PERMISSION_DENIED`) when it does not. On the
`PACT` facade it also emits an event first — `granted` on success, `denied`
immediately before the throw — for audit trails. Subscribe with `.on()` or an
`_on<event>` constructor option.

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
  modules: { Post: ['READ', 'EDIT', 'DELETE'] },
  _ondenied: (module, permission) =>
    console.warn('denied', module, String(permission)),
});

const grants = { Post: 3n }; // READ | EDIT

pact.assert('Post', 'EDIT', grants); // ok — emits `granted`, returns void
pact.assert('Post', 'DELETE', grants); // emits `denied`, then throws PactDeniedError
```

Catch `PactDeniedError` to turn a denial into a 403 — it is distinct from the
`PactDefinitionError` a config bug (unknown module / inapplicable permission)
throws.

## Mask math

Five helpers compute masks without hand-rolling bitwise ops. `grant` / `revoke`
add / remove bits (OR / AND-NOT); `diff` reports what changed between two masks;
`toNames` / `toMask` convert between a mask and its permission names (validated
against the module's catalog when one exists).

```typescript
import { PACT } from '@tundralibs/pact';
// pact configured as in "The bitmask model" above

pact.grant(0n, 'READ', 'EDIT'); // 3n — READ | EDIT
pact.revoke(3n, 'EDIT'); // 1n — READ
pact.diff(3n, 5n); // { added: 4n, removed: 2n }  (READ|EDIT → READ|DELETE)
pact.toNames('Post', 3n); // ['READ', 'EDIT']
pact.toMask('Post', ['READ', 'DELETE']); // 5n
```

## Authorization-only: the Permissions class

If you only need authorization — no tokens, groups, or login — construct the
`Permissions` engine directly. It is the same bitmask core the `PACT` facade
wraps, with the identical registry, catalog, checks, and mask math, minus the
event emission (its `assert` throws but emits nothing).

```typescript
import { Permissions } from '@tundralibs/pact';

const perms = new Permissions(
  { READ: 1n, EDIT: 2n, DELETE: 4n },
  { Post: ['READ', 'EDIT', 'DELETE'], Billing: ['READ'] },
);

perms.has('Post', 'EDIT', { Post: 3n }); // true
perms.assert('Post', 'DELETE', { Post: 3n }); // throws PactDeniedError
```

## The coarse-grained boundary

PACT authorizes `module × action` — "can this principal EDIT Posts?" — and
deliberately stops there. It has no notion of a specific row, an owner, or an
attribute: "can they edit **this** post (the one they authored)?" is a question
about your data, not about the permission model, so PACT leaves it to your
application.

The idiom is to layer the two: gate the action with PACT, then apply the
instance rule yourself.

```typescript
import { PACT } from '@tundralibs/pact';
// pact configured as in "The bitmask model" above

function editPost(
  post: { authorId: string },
  actor: { id: string },
  grants: Record<string, bigint>,
) {
  pact.assert('Post', 'EDIT', grants); // coarse: may this actor edit Posts at all?
  if (post.authorId !== actor.id) { // fine-grained: is it THEIR post? — app logic
    throw new Error('not the author');
  }
  // …apply the edit
}
```

Keeping the boundary coarse is what keeps the model a fast, storage-free
bitmask; ownership, tenancy, and attribute rules stay where the data lives.

## Related

- [Groups](./Pact-Groups.md) — resolving and caching group-based grants,
  OR-combined across a principal's groups.
- [Tokens](./Pact-Tokens.md) — embedding a grants map in a JWT (BigInt masks
  serialized as strings).

---

[← Back to Pact](../README.md)
