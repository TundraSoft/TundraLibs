# Tenants

pact scopes permissions to a tenant through the grant key. A check on
`acme::Post` passes on the principal's `acme::Post` grant. A bare `Post`
grant has no tenant and applies in every tenant, which is how a platform
super admin is expressed.

This page covers the keys, how to build and check them, and how accounts
relate to tenants. pact does not store tenants or read requests; your hooks
and your framework supply both.

## Table of Contents

- [Grant keys](#grant-keys)
- [How a check resolves](#how-a-check-resolves)
- [Building tenant grants](#building-tenant-grants)
- [Checking the target's tenant](#checking-the-targets-tenant)
- [Keeping grants current](#keeping-grants-current)
- [Accounts and tenants](#accounts-and-tenants)
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

Module names may not contain `::`. `Pact.create` rejects one with
`INVALID_OPTION`, since `a::b::Post` would otherwise be ambiguous.

## How a check resolves

`hasPermission(id, 'acme::Post', 'EDIT')`, `assert`, and the same methods on a
bound principal combine two masks: the principal's `acme::Post` grant and its
global `Post` grant (either spelling). A check on bare `Post` reads only the
global grant.

The key splits at its last `::`. The module half must be declared, so a typo
still throws `UNKNOWN_MODULE`. The tenant half usually comes from the
request, so a malformed tenant denies instead of throwing:

| Tenant in the check    | Result                                   |
| ---------------------- | ---------------------------------------- |
| One the user is in     | Their tenant grant plus any global grant |
| One the user is not in | Only a global grant can pass             |
| Empty (`::Post`)       | The global check                         |
| Contains `::`          | Only a global grant can pass             |

None of these can grant more than the principal holds, so a forged tenant
earns a 403.

## Building tenant grants

Store grants bare, `{ Post: 3 }`, next to the tenant they belong to (a
group's or a user's tenant column). In `getPrincipal`, prefix each module
with that tenant. Platform staff have no tenant, so their grants stay bare
and apply everywhere.

```typescript
import type { PactHooks } from '@tundralibs/pact';

type Modules = 'Post' | 'Billing';
declare const db: {
  user(id: string): Promise<{ id: string; tenant: string | null } | null>;
  groupGrants(userId: string): Promise<Record<string, number>[]>;
};

const hooks: PactHooks<Modules> = {
  getPrincipal: async (id) => {
    const user = await db.user(id);
    if (user === null) return null;
    const grants: Record<string, bigint> = {};
    for (const group of await db.groupGrants(id)) {
      for (const [module, mask] of Object.entries(group)) {
        const key = user.tenant === null ? module : `${user.tenant}::${module}`;
        grants[key] = (grants[key] ?? 0n) | BigInt(mask);
      }
    }
    return { kind: 'USER', id: user.id, grants };
  },
};
console.log(hooks);
```

Deriving the prefix, rather than storing `{ 'acme::Post': 3 }`, has three
advantages:

- **One source of truth.** The tenant lives only in its column, so no grant
  key can disagree with it.
- **No escalation through data.** Grants are usually written from an admin
  form. A stored `globex::Post`, or a bare `Post` (a super-admin grant),
  would escalate. Derived, the first becomes `acme::globex::Post`, which pact
  denies, and a bare key can never appear on a tenant's principal.
- **No rewriting.** Cloning a group template into a new tenant, reseeding
  grants from the permission catalog, or renaming a tenant needs no key
  changes.

The prefix costs one string join per grant while a principal is built. With
a principal cache TTL it runs once per cache entry.

## Checking the target's tenant

Build the check's key from the tenant of the resource being acted on, never
from the user's own tenant. A check against the user's own tenant always
passes and proves nothing:

```typescript
import type { PactBoundPrincipal } from '@tundralibs/pact';

declare const principal: PactBoundPrincipal<'Post', { EDIT: 2n }>;
declare const post: { tenant: string }; // the row being edited

await principal.assert(`${post.tenant}::Post`, 'EDIT');
```

pact does not read requests. The framework decides which tenant a request
targets (a path parameter, subdomain, header, or the row itself). Three
rules keep that safe:

- **Act on the tenant you checked.** If the check uses the path's `:org`,
  query with that same value, never a second one from the body. Checking one
  tenant and writing to another is a confused-deputy bug pact cannot see.
- **Use a canonical tenant id.** Grants under `acme` do not match a check on
  `Acme`. Use stable ids, not display names.
- **Hide other tenants first, if they must not be probed.** A tenant user
  naming another tenant gets a 403 from pact, which confirms that tenant
  exists. An app-level membership check that answers 404 before the pact
  check keeps tenant ids unguessable.

The middleware `authorize(module, permission)` guards are fixed per route and
take a plain module, so check tenant-scoped keys in the handler.

## Keeping grants current

Grants live in your storage, where pact cannot see writes. After a change
that alters what a user may do, call `pact.invalidatePrincipal(userId)`:

- a membership added or removed;
- a group's grants edited (for each member);
- a user deactivated, or a tenant suspended (for its users).

It evicts the cached principal and makes every outstanding bound principal
re-resolve at its next check. Call it even without a principal cache. A
bound principal held beyond one request (a WebSocket connection, a
background job's `principalOf`) otherwise keeps its grants for its
freshness window, 60 seconds by default. `revokeApiKey` does this for keys.

## Accounts and tenants

The grant keys work with either account model. pact's login takes an opaque
`identifier`, and a principal is resolved by account id alone, so the choice
lives in your hooks.

### One account per person

One account per email, across tenants and platform staff. This is the usual
choice when the tenant is known from the account:

- The identifier is the plain email; login needs nothing extra.
- An account belonging to one tenant gets that tenant's prefix, as in
  [Building tenant grants](#building-tenant-grants).
- If one account can belong to several tenants, take the prefix from each
  group's tenant instead of the user's. The principal then carries one set
  of keys per tenant, which suits tens of tenants per person.
- A tenant's own SSO provider must link to the existing account instead of
  creating a second one. pact never links automatically, to prevent account takeover,
  so leave `autoProvision` off for tenant providers. pact then throws
  `OAUTH_UNLINKED`, and your app links the identity after checking that the
  tenant vouches for that email.

### One account per tenant

A person in two tenants has two accounts, each with its own credentials. Scope
the identifier by tenant in every login entry point:

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

For OAuth, name each tenant's provider after the tenant, as
[Multi-tenant OAuth](Pact-MultiTenantOAuth.md#naming-convention) suggests
(`acme:entra`), and set the `oauthIdentifier` hook. It maps the identifier
pact derives for a new OAuth user (the verified email) to the one it stores:

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

## Turning tenancy on in an existing app

In an app without tenants every grant is global. Once tenant-scoped checks
exist, a global grant means every tenant. Before switching routes to
`acme::Post`-style checks, make sure only platform staff hold bare grants:
with the prefix derived in `getPrincipal`, every tenant user's grants become
tenant keys at once. Otherwise every existing user passes every tenant's
checks.

---

[← Back to Pact](../README.md)
