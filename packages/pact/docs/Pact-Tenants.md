# Tenants

pact scopes permissions to a tenant through the grant key. A grant for
module `Post` in tenant `acme` is stored under `acme::Post`, and a check on
`acme::Post` reads it. A bare `Post` grant has no tenant and applies in every
tenant, which is how a platform super admin is expressed.

This page covers tenant-scoped grants, how each tenant keeps its own user
accounts, and what the framework around pact has to supply.

## Table of Contents

- [Grant keys](#grant-keys)
- [How a check resolves](#how-a-check-resolves)
- [Accounts per tenant](#accounts-per-tenant)
- [Where the tenant comes from](#where-the-tenant-comes-from)
- [Turning tenancy on in an existing app](#turning-tenancy-on-in-an-existing-app)

## Grant keys

A grant key is a module name, optionally prefixed by a tenant and `::`. The
type is `PactGrantKey<M>`, so a key whose module half is not declared fails to
compile.

| Key          | Meaning                                         |
| ------------ | ----------------------------------------------- |
| `Post`       | Global: applies in every tenant                 |
| `::Post`     | The same as `Post`                              |
| `acme::Post` | Applies only when the check names tenant `acme` |

Grants use the same keys, in `getPrincipal`'s result and in the stored
`serializeGrants` JSON:

```typescript
import type { PactPrincipal } from '@tundralibs/pact';

const admin: PactPrincipal<'Post'> = {
  kind: 'USER',
  id: 'root',
  grants: { Post: 7n }, // every tenant
};
const editor: PactPrincipal<'Post'> = {
  kind: 'USER',
  id: 'u-42',
  grants: { 'acme::Post': 3n }, // acme only
};
console.log(admin, editor);
```

Module names may not contain `::`. `Pact.create` rejects one with
`INVALID_OPTION`, since `a::b::Post` would otherwise be ambiguous.

## How a check resolves

`hasPermission(id, 'acme::Post', 'EDIT')`, `assert`, and the same methods on a
bound principal combine two masks: the principal's `acme::Post` grant and its
global `Post` grant (either spelling). A check on bare `Post` reads only the
global grant.

The key splits at its last `::`. The module half must be declared, so a typo
still throws `UNKNOWN_MODULE`. The tenant half is usually taken from the
request, so a malformed tenant denies instead of throwing:

| Tenant in the check    | Result                                   |
| ---------------------- | ---------------------------------------- |
| One the user is in     | Their tenant grant plus any global grant |
| One the user is not in | Only a global grant can pass             |
| Empty (`::Post`)       | The global check                         |
| Contains `::`          | Only a global grant can pass             |

None of these can grant more than the principal holds, so a forged tenant
earns a 403.

## Accounts per tenant

The simplest tenant model gives each tenant its own user accounts: a person
in two tenants has two accounts, each with its own id, credentials and
grants. A principal then carries one tenant's grants, and the principal cache
needs no tenant in its key.

pact's login entry points take an opaque `identifier`, so scoping accounts
per tenant is a naming choice in your hooks. Build the identifier from the
tenant and the login name:

```typescript
import { Pact } from '@tundralibs/pact';

declare const pact: Pact<{ READ: 1n }, 'Post'>;
declare const tenant: string; // from the subdomain or login form

await pact.login({
  identifier: `${tenant}::ada@example.com`,
  password: 'correct horse battery staple',
});
```

`register`, `requestPasswordReset` and `requestEmailVerification` take the
same identifier, and your `getUser` hook receives it unchanged.

OAuth needs one more step. Name each tenant's provider after the tenant, as
[Multi-tenant OAuth](Pact-MultiTenantOAuth.md#naming-convention) suggests
(`acme:entra`). Then set the `oauthIdentifier` hook, which maps the
identifier pact derives for a new OAuth user (the verified email) to the one
it stores:

```typescript
import type { PactHooks } from '@tundralibs/pact';

const hooks: PactHooks = {
  oauthIdentifier: (identifier, profile) =>
    `${profile.provider.split(':')[0]}::${identifier}`,
};
console.log(hooks);
```

Without the hook, the first tenant to provision `ada@example.com` claims that
identifier, and her first login to a second tenant throws `USER_EXISTS`.

Super admins sit outside every tenant: an identifier with no tenant prefix
and global grants.

## Where the tenant comes from

pact does not read requests. The framework decides which tenant a request is
for (a path parameter, subdomain or header) and passes it in the key. Two
rules keep that safe:

- **Act on the tenant you checked.** If the check uses the path's `:org`,
  the handler must query with that same value, never a second one from the
  body. Checking one tenant and writing to another is a confused-deputy bug
  pact cannot see.
- **Use a canonical tenant id.** Grants stored under `acme` do not match a
  check on `Acme`. Use stable ids, not display names.

The middleware `authorize(module, permission)` guards are fixed per route and
take a plain module today. For a tenant-scoped route, check in the handler:

```typescript
import type { PactBoundPrincipal } from '@tundralibs/pact';

declare const principal: PactBoundPrincipal<'Post', { EDIT: 2n }>;
declare const org: string; // the route's :org parameter

await principal.assert(`${org}::Post`, 'EDIT');
```

## Turning tenancy on in an existing app

In an app without tenants every grant is global. Once tenant-scoped checks
exist, a global grant means every tenant. Before switching routes to
`acme::Post`-style checks, move ordinary users' grants under their tenant's
keys and keep bare grants only for platform administrators. Otherwise every
existing user passes every tenant's checks.

---

[← Back to Pact](../README.md)
