# DESIGN — Authentication & authorization (pact integration)

Status: **DECIDED / locked 2026-08-26.** Build pending. Records how auth works
in rAPId, how pact 0.5.0 is integrated, and how norm + pact compose. This is a
dev-only design note (publish-excluded).

## Principle

Two layers, deliberately separated:

1. **The generic seam (rAPId core, auth-agnostic).** Knows nothing about pact.
   Any auth system — pact, Lucia, Auth.js, a hand-rolled JWT — lives here.
   - `ctx.auth` / `ctx.setAuth(identity)` — a plain bag (`Record<string, unknown>`).
   - `authenticate({ verify, extract? })` — extract a token, run the app's
     `verify`, set `ctx.auth`. BYO auth.
   - `authorize(check?)` — 401 if no `ctx.auth`, 403 if `check(auth)` is falsy.

2. **The pact adapters (opt-in, pact-only, `@tundralibs/rapid/auth` subpath).**
   A richer way to fill the _same_ `ctx.auth` bag and check permissions. pact is
   a **type-only** import — rAPId runs zero pact code; the app constructs the
   `Pact` instance and hands it in. Apps that never import this subpath never
   pull pact into their type/runtime surface.

BYO and pact converge on the same seam, so an app can mix them (pact on API
routes, a custom `verify` elsewhere) and `authorize` works for both.

## The pact adapters

```ts ignore
import type { Pact, PactCredential, PactPrincipal, PactPermissionRef } from '@tundralibs/pact';

// scheme extractors: (ctx) => PactCredential | null — parse ONE credential from the request
bearer()                       // Authorization: Bearer <t>  → { scheme:'BEARER', token }
basic()                        // Authorization: Basic <b64> → { scheme:'BASIC', identifier, password }
apiKey({ header, format })     //                            → { scheme:'APIKEY', keyId, secret }
hmac({ canonical, maxSkew })   //                            → { scheme:'HMAC', keyId, signature, payload }
token()                        // Authorization: Token <t>   → { scheme:'TOKEN', token }

// try schemes in order → first match → pact.authenticate(cred) → ctx.setAuth(principal)
authenticate({ pact, schemes? })   // schemes default [bearer(), basic()]
authorize(check?)                  // generic enforcement (layer 1)
can(pact, permission, module)      // a check for authorize(): → pact.can(principal, permission, module)
// PactDeniedError → 403 in disclosure
```

- pact never parses transport; the extractors are the request→`PactCredential`
  bridge. `schemes` is "which credential types this route accepts, in
  precedence order" — the app's pick-and-choose.
- pact dispatches on `credential.scheme`; a matched-but-invalid credential →
  anonymous (`authorize` rejects downstream), it does not fall through schemes.

## Services via doctor (app-singletons only)

The `Pact` and `Norm` instances are app-lifetime **services**, registered once
under typed doctor labels and read where needed — the SAME mechanism, nothing
pact/norm-specific in core.

- **Explicit is the taught path** (dependency stays visible): `authenticate({ pact })`,
  `can(pact, …)`, modules take `inject(DB)` at their field.
- **`inject(PACT)` is a documented, secondary convenience** for apps already on
  doctor — not the headline.
- **No `app.provide/get` grab-bag sugar** — a blessed "stash anything, grab
  anywhere" API invites the service-locator / god-object / request-state-at-app-scope
  abuses. doctor's typed labels + deliberate `stock` are the ceiling.
- **Hard line:** doctor = app-singleton services; per-request data stays in
  `ctx.state` / `ctx.auth` / `ctx.config`. Never the app registry.

## norm + pact composition (the storage seam)

pact owns no storage; its hooks ARE norm queries. Crypto stays in pact (hooks
see only hashes).

```ts ignore
// db.ts
export const norm = new Norm({ database: { dialect:'postgres', /* … */ pool: { max: 15, acquireTimeoutSeconds: 5 } } });
export const db = norm.use(App);

// auth.ts — pact's storage hooks backed by norm
export const pact = Pact.create({
  bits: { READ: 1n, WRITE: 2n, DELETE: 4n },
  secret: /* env */, apiKeys: true, session: { refresh: {} },
  hooks: {
    getUser: (q) =>
      q.by === 'IDENTIFIER' ? db.repo('Users').findOne({ '@email': q.identifier })
      : q.by === 'ID'       ? db.repo('Users').findOne({ '@id': q.id })
      :                       db.repo('Users').findOne({ '@oauthSub': q.subject }),
    createUser: (d) => db.repo('Users').insert(d),          // d.secret already hashed
    updateUser: (id, p) => db.repo('Users').update(p, { '@id': id }),
    saveSession: (s) => db.repo('Sessions').upsert(s),
    getSession: (id) => db.repo('Sessions').findOne({ '@id': id }),
    deleteSession: (id) => db.repo('Sessions').delete({ '@id': id }),
    getApiKey: (id) => db.repo('ApiKeys').findOne({ '@id': id }),
    saveApiKey: (r) => db.repo('ApiKeys').upsert(r),
  },
});

// main.ts — stock the two services once, then mount
Doctor.stock(DB, db);
Doctor.stock(PACT, pact);   // PACT label + usePact() exported by @tundralibs/rapid/auth
app.modules(Modules);       // modules' inject(DB) resolves here
```

```ts ignore
// a module: norm for data, the pact seam on routes
class PostsModule extends BlogModule {
  private readonly db = inject(DB); // one shared pool
  @GET('/posts')
  list = () => this.db.repo('Posts').find({ '@published': true });
  @POST('/posts', { middleware: [authorize(can(pact, 'WRITE', 'Post'))] })
  create = (ctx) =>
    this.db.repo('Posts').insert({
      ...ctx.args.payload,
      authorId: ctx.auth.id,
    });
}
```

- **One registry, two services.** DB and pact both `stock`ed; core learns
  neither.
- **They connect at the hooks** — pact's storage seam _is_ norm queries; no
  adapter, no second store.
- **Hot-path caveat:** `getUser` runs on every authenticated request (a DB
  round-trip). Cache it in the **app's hook** (`@tundralibs/cacher`) — NOT by
  caching the principal in rAPId, which would bypass pact's per-request
  revocation (`isRevoked` / session expiry) and let a revoked token live to TTL.

## Considered & rejected

- **`app.provide/get` sugar** — service-locator/god-object abuse magnet.
- **Principal cache inside the middleware** — bypasses pact revocation; caching
  belongs in the app's `getUser` hook (pact still runs its checks).
- **Dropping the generic `verify`** — strands BYO-auth developers; layer 1 stays.
- **Registering pact on the app (core option)** — couples core to pact and
  disadvantages BYO auth; pact is passed to its adapters instead.
- **pact ships the rАPId adapter** — cleaner coupling direction, but shipping the
  pact middleware in rАPId "for free" (pact is the first-party sibling) wins on
  ergonomics; the generic seam covers third-party auth.

## Intended convergence (not blocking v1)

**HMAC request-signing should move into pact.** The canonical string + header
format + timestamp/skew are a shared security contract between the client that
signs (the restler client) and the server that verifies; two definitions drift
→ silent signature failures. pact's roadmap already scopes `signRequest` /
`verifyRequest` for this. So rАPId's `hmac()` extractor is designed as a **thin
wrapper that will delegate to pact's request-signing parse** once pact ships it;
until then rАPId + the app own the canonical builder. Bearer/Basic/Token/apiKey
extractors stay in rАPId (trivial / app-shaped, no shared contract).

## Build scope

Layer 1 kept as-is. Build layer 2 under `@tundralibs/rapid/auth`:
`authenticate({ pact, schemes })` + the five extractors, `authorize`/`can`,
`PACT` label + `usePact()`, `PactDeniedError→403`; blog example wired to
norm+pact (a pact route + a BYO-`verify` route); docs. Endpoint helpers
(`login`/`logout`/`refresh`/OAuth) are a follow-on that reuse the same
registered pact.
