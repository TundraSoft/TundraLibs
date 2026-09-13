# Multi-tenant OAuth

`options.oauth` (see [OAuth](Pact-OAuth.md)) configures every provider
instance at construction — the right shape for a fixed set of global
providers (Google/GitHub sign-in for every user, say). It stops fitting
the moment provider instances are one **per tenant** instead: each
customer brings their own enterprise identity provider (their own
Microsoft Entra ID tenant, their own Google Workspace, their own generic
OIDC issuer), added, edited, and removed while the app keeps running —
you cannot know that set at construction, and you cannot restart every
running process every time one customer changes their SSO settings.

This page covers registering, updating, and removing an OAuth provider
instance AFTER construction, and the one thing you still have to build
yourself: making sure every running instance of your app agrees on the
current set.

## Table of Contents

- [The three runtime methods](#the-three-runtime-methods)
- [Naming convention](#naming-convention)
- [Validate at write time, not at first login](#validate-at-write-time-not-at-first-login)
- [Propagating to every running instance](#propagating-to-every-running-instance)
- [A worked shape](#a-worked-shape)
- [What NOT to do](#what-not-to-do)

## The three runtime methods

```typescript
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  bits: { READ: 1n },
  modulePermissions: { Post: ['READ'] },
  hooks: {},
});

// Register — or replace — one provider instance. Runs the SAME
// validation the constructor's `oauth` option does: a bad config
// throws `INVALID_OPTION` immediately, never silently succeeds.
pact.updateOAuth('acme:entra', {
  kind: 'OIDC',
  issuer: 'https://login.microsoftonline.com/acme-tenant-id/v2.0',
  clientId: 'acme-app-registration-id',
  clientSecret: 'secret', // load from your own secret store
  redirectUri: 'https://app.example.com/auth/acme-entra/callback',
});

// Every currently-registered instance name — whatever the constructor
// declared, plus everything added since, minus everything removed.
pact.oauthProviders; // readonly string[]

// Remove one. A later oauthRedirect()/oauthLogin() against that name
// fails UNKNOWN_PROVIDER, same as a name that was never configured.
pact.removeOAuth('acme:entra');
```

Calling `updateOAuth` again with a name that already exists REPLACES
that instance — the usual case is a tenant editing their IdP settings,
not adding a second one under the same name. `OAuthClient` instances are
immutable, so a login already in flight against the OLD client finishes
against it; nothing about an in-progress redirect/callback pair breaks
mid-flight when you replace the provider it started with.

Both `updateOAuth` and `removeOAuth`, like the constructor's own `oauth`
loop, do no network I/O — even the `OIDC` kind only resolves its
discovery document lazily, on first `oauthRedirect`/`oauthLogin` call.
Registering a thousand tenant IdPs costs nothing until a user from one of
them actually tries to log in.

## Naming convention

`oauthRedirect(name)` / `oauthLogin(name, ...)` take whatever string you
registered the provider under — pact has no opinion on its shape. For a
per-tenant deployment, a composite name that encodes the tenant keeps
static and dynamic providers on the same footing and keeps routing
simple:

```text
<tenantSlug>:<kind>       acme:entra, acme:workspace, globex:oidc
```

Your login route becomes `/auth/:tenant/:kind/redirect` and
`/auth/:tenant/:kind/callback`, both resolving straight to
`` `${tenant}:${kind}` `` — no separate lookup table mapping a route
parameter to a provider name.

## Validate at write time, not at first login

The whole point of building every `OAuthClient` eagerly (constructor or
`updateOAuth`, same code path) is that a bad config fails at THAT
moment — "so a typo fails at boot, not at first login" is pact's
existing principle for the static case ([OAuth](Pact-OAuth.md#configuration)).
For a dynamic provider, the equivalent moment is wherever a tenant
registers or edits their IdP settings, and that admin action is the
natural place to enforce it:

```typescript ignore
// The admin-facing "save this tenant's SSO config" handler:
async function saveTenantIdp(tenantSlug: string, config: TenantIdpInput) {
  const name = `${tenantSlug}:${config.kind}`;
  try {
    pact.updateOAuth(name, toProviderConfig(config)); // throws on a bad config
  } catch (error) {
    return { status: 400, body: { error: String(error) } };
  }
  // Only reaching here means pact accepted it — NOW persist it.
  await db.tenantIdps.upsert({ tenantSlug, ...config });
  return { status: 200 };
}
```

Validate-then-persist, never persist-then-validate: a config that fails
`updateOAuth` never reaches your database, so every OTHER instance's
reconciliation pass (next section) can trust that anything it reads back
out is known-good — it never has to re-run the validation your admin
handler already did.

## Propagating to every running instance

`updateOAuth`/`removeOAuth` only mutate the ONE `Pact` instance that
calls them. In a single-process deployment that is the whole story. In a
horizontally-scaled one, the other running instances still hold whatever
they last knew — a request routed to a DIFFERENT instance than the one
that handled the admin write sees the OLD config (or none) until
something tells that instance to catch up.

**Default recommendation: a periodic reconciliation loop, not pub/sub.**
Every instance, on a timer (a minute is generally short enough — this is
an admin action, not a request-hot path), diffs `pact.oauthProviders`
against the source of truth (your own database table of tenant IdPs) and
calls `updateOAuth`/`removeOAuth` for whatever changed:

```typescript ignore
async function reconcileOAuthProviders() {
  const rows = await db.tenantIdps.findAll(); // your own source of truth
  const wanted = new Map(rows.map((r) => [`${r.tenantSlug}:${r.kind}`, r]));

  for (const name of pact.oauthProviders) {
    if (!wanted.has(name)) pact.removeOAuth(name);
  }
  for (const [name, row] of wanted) {
    pact.updateOAuth(name, toProviderConfig(row)); // cheap even if unchanged
  }
}

// Run once before serving traffic — "boot" is just poll zero — then on
// a timer (@tundralibs/cronus, or your framework's own scheduler).
await reconcileOAuthProviders();
setInterval(reconcileOAuthProviders, 60_000);
```

This one loop covers BOTH cases with no extra code: a freshly-started
instance hydrates its full set on the first run, and a long-running
instance picks up any change on the next tick. It needs no additional
infrastructure (no broker, no pub/sub channel) and is self-healing — an
instance that missed a change for any reason (a restart mid-update, a
dropped message on some OTHER mechanism) corrects itself on its very
next poll, which a fire-and-forget notification alone cannot promise.

Re-running `updateOAuth` for an unchanged row is harmless — it just
replaces the `OAuthClient` with an equivalent one — so the loop above
doesn't need to diff row CONTENT, only row PRESENCE. If reconciliation
cost becomes a real concern at a very large tenant count, add a
`updatedAt` filter to only re-fetch rows that changed since the last
poll; that's a query optimization, not a change to the shape.

If a minute of worst-case propagation lag to instances OTHER than the
one that handled the write is too slow for your use case, add a pub/sub
notification (Redis, or your queue of choice) that triggers an
OUT-OF-BAND run of the same `reconcileOAuthProviders` function on every
instance when a change happens — a latency optimization layered on top
of the loop, not a replacement for it. Keep the periodic poll regardless,
as the self-healing fallback for whenever the notification itself is
missed.

## A worked shape

Putting the pieces together, a per-tenant OAuth deployment is:

1. **Your own table** of tenant → IdP config (issuer, client id/secret,
   redirect URI, kind). Pact does not store this — it is the input to
   `updateOAuth`, not something pact tracks on your behalf.
2. **An admin write path** that calls `updateOAuth` synchronously,
   returns 400 on `INVALID_OPTION`, and only then writes to that table.
3. **A reconciliation loop**, run once at startup and then on a timer,
   that diffs `pact.oauthProviders` against the table and calls
   `updateOAuth`/`removeOAuth` to catch this instance up.
4. **Composite provider names** (`<tenant>:<kind>`) so your login routes
   need no separate lookup between a route parameter and a provider
   name.
5. _(Optional)_ a pub/sub trigger that runs step 3 out-of-band for lower
   propagation latency, with the timer kept as the fallback.

## What NOT to do

- **Don't build an `OAuthClient` yourself outside `updateOAuth`.** The
  class is exported for pact's own internal use; `updateOAuth` is the
  supported way to register one, and it stays in sync with whatever
  validation the constructor's `oauth` loop does as pact evolves.
- **Don't persist a tenant's config before `updateOAuth` accepts it.**
  Persist-then-validate lets a bad config sit in your database, silently
  broken, until the affected tenant's first login attempt discovers it —
  exactly the failure mode eager construction exists to prevent.
- **Don't skip the periodic loop because you added pub/sub.** A message
  bus can drop a message (a redeploy mid-publish, a broker restart); the
  loop is what makes a missed notification a non-event instead of a
  standing inconsistency between instances.

---

[← Back to Pact](../README.md)
