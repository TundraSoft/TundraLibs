# DESIGN — Authentication & authorization (pact integration)

Status: **FROZEN 2026-08-26.** Design complete; implementation next. Records
how auth works in rAPId, how pact 0.5.0 is integrated, and how norm + pact
compose. Dev-only design note (publish-excluded).

## Principle

Two layers, deliberately separated:

1. **The generic seam (rAPId core, auth-agnostic).** Unchanged by this
   design. Knows nothing about pact — any auth system (pact, Lucia, Auth.js,
   hand-rolled) lives here.
   - `ctx.auth` / `ctx.setAuth(identity)` — a plain bag (`Record<string, unknown>`).
   - `authenticate({ verify, extract? })` — extract a token, run the app's
     `verify`, set `ctx.auth`. Never rejects. BYO auth.
   - `authorize(check?)` — 401 if no `ctx.auth`, 403 if `check(auth)` is falsy.
     With no `check`, it's just "must be logged in."
2. **The pact adapter (opt-in, pact-only, `middlewares/pact/` subpath).** A
   richer way to fill the _same_ `ctx.auth` bag and check permissions. pact is
   a **type-only** import — rAPId runs zero pact code, and importing anything
   else from `rapid/middlewares` never pulls pact in. It is **not** built on
   top of layer 1's `authenticate()` — it needs a response-side phase that
   function doesn't have, so it's its own implementation (see below).

BYO and pact converge on the same `ctx.auth` seam, so an app can mix them
(pact on API routes, a custom `verify` elsewhere) and `authorize()` works for
both.

## The pact adapter (`middlewares/pact/`)

New export subpath: `"./middlewares/pact": "./middlewares/pact/mod.ts"` —
deliberately separate from `"./middlewares"` so the main barrel stays
pact-free.

### `pact(options)` — one-time app-wide init

```ts ignore
import { pact, authenticate, authorize } from '@tundralibs/rapid/middlewares/pact';

// main.ts — called exactly ONCE, anywhere else never re-runs this
pact({
  // Pact.create()'s own options (hooks, bits, secret, apiKeys, session, …)
  hooks: { getUser, createUser, updateUser, getApiKey, saveApiKey, /* … */ },
  bits: { READ: 1n, WRITE: 2n, DELETE: 4n },
  secret: /* env */,

  // rapid's scheme + response config — exact shape is an implementation-time
  // decision, sketched here for illustration only:
  Bearer: { HeaderName: 'authorization', Prefix: 'Bearer', AddToResponse: true },
  ApiKey: { HeaderName: 'x-api-key', SecretHeader: 'x-api-secret' },
  Hmac: {
    canonicalForVerify: (ctx) => /* app builds the string that was signed */,
    canonicalForSign: (ctx) => /* app builds the string the response signs */,
  },
});
```

`pact(options)` does three things internally, exactly once:

1. `Pact.create(...)` — builds the instance. The app never calls this
   directly.
2. Builds the resolved per-scheme config (extractors + response behavior)
   from the rest of `options`.
3. `Doctor.stock(PACT, { pact, schemes })` — registers the bundle. **No
   separate `usePact()` helper, no property on the app object** — this is the
   only registration path, and it happens as a side effect of the one call
   above. (See "Considered & rejected" for why a separate helper was
   dropped.)

It returns the created `Pact` instance for advanced direct use (e.g. calling
`pact.sign()` outside a request); ordinary route code never touches the
return value.

### `authenticate(schemes?)` — stateless, resolved via `inject(PACT)`

```ts ignore
// any route file, any number of them — no re-init risk, nothing imported
// from a shared instance, just this subpath:
import { authenticate, authorize } from '@tundralibs/rapid/middlewares/pact';

app.use(authenticate()); // global — any configured scheme
app.use('/webhook', authenticate(['HMAC'])); // this route: HMAC only
app.use('/api', authenticate(['BEARER', 'APIKEY']));
```

`authenticate(schemes?: PactScheme[])` resolves `{ pact, schemes }` via
`inject(PACT)` **at call time** (setup/mount time — the same timing modules
already use for `inject(DB)`, not per-request). It never holds a closure over
a specific `Pact` instance, so it's safe to import from as many files as you
like — that's the whole point of routing through doctor instead of a factory
return value. `schemes?` narrows which of the pre-configured schemes this
particular mount accepts; omitted means all of them.

Per request, the returned middleware:

- **Pre-process.** Tries each allowed scheme's extractor in order, first
  match wins, parses one `PactCredential`, calls `pact.authenticate(credential)`.
  On a resolved principal, sanitizes and calls `ctx.setAuth(...)` (see below).
  Never rejects — anonymous requests flow through with `ctx.auth` unset, same
  contract as layer 1's `authenticate`. Runs `next()`.
- **Post-process** (after `await next()`). Per-scheme, config/callback-driven
  response augmentation — the framework does **not** hardcode what goes in
  the response; each scheme's config in `pact(options)` supplies a toggle or
  callback (e.g. `Bearer.AddToResponse`, `Hmac.canonicalForSign`). For HMAC
  specifically this signs the response with the **same per-key secret** the
  caller authenticated with, via a new pact primitive (see "Pending pact
  changes" — not built yet).

### `ctx.auth` shape — the principal, always, plus sanitized public fields

```ts ignore
ctx.setAuth({
  ...principal,
  authMode: credential.scheme,
  ...publicCredentialFields,
});
```

The principal (`id`, `grants`, `status`, `metadata`) is **always** present,
for every scheme, unconditionally. `publicCredentialFields` adds whatever is
safe to expose from the raw credential on top of that:

| scheme | extra fields kept | dropped (secret)                   |
| ------ | ----------------- | ---------------------------------- |
| BASIC  | `identifier`      | `password`                         |
| BEARER | —                 | `token` (holding it _is_ the auth) |
| TOKEN  | —                 | `token` (same reason)              |
| APIKEY | `keyId`           | `secret`                           |
| HMAC   | `keyId`           | `signature`, `payload`             |

`keyId` being on `ctx.auth` is also what lets the post-process step sign the
response — it reads `ctx.auth.keyId` directly, no separate credential
threading needed.

### `authorize(module, permission)` — the full check, no `can()` glue

```ts ignore
export function authorize(module: string, permission: string): RapidMiddleware {
  const { pact } = inject(PACT);
  return coreAuthorize((auth) =>
    pact.can(auth as PactPrincipal, permission, module)
  );
}
```

Built on core's existing `authorize(check)` internally (single source of
truth for the 401/403 enforcement logic), but exposed as one ready call — no
separate `can()` export. **Parameter order is `(module, permission)`**,
matching pact's own `can(principal, module, permission)` (pact 0.6.0+).

Core's bare `authorize()` (no args) is reused as-is for "must be logged in,
whichever scheme" — no new function needed for that case.

### Not built yet, same shape when it happens

`login` / `logout` / `refresh` / OAuth redirect-callback handlers are a
**follow-on** — out of scope for this build. When they land, they follow the
same pattern: stateless exports from `middlewares/pact/`, `inject(PACT)`
internally, no new registration mechanism.

## Services via doctor (app-singletons only)

- `pact(options)` is the **only** place a `Pact` instance is created or
  registered. Everything else reaches it via `inject(PACT)`.
- Same mechanism `Norm`/`DB` already uses — nothing pact-specific in core.
- **No `app.provide/get` grab-bag sugar, no `usePact()` helper distinct from
  doctor's own stock** — a second registration path invites exactly the
  service-locator/god-object drift the "considered & rejected" section below
  flags.
- **Hard line:** doctor = app-singleton services; per-request data stays in
  `ctx.auth` / `ctx.state` / `ctx.config`. Never the app registry.

## norm + pact composition (the storage seam)

pact owns no storage; its hooks ARE norm queries. Crypto stays in pact
(hooks see only hashes, except HMAC keys which need the retrievable secret).

```ts ignore
// db.ts
export const norm = new Norm({
  database: { dialect: 'postgres', pool: { max: 15 } },
});
export const db = norm.use(App);
export const DB = label<typeof db>('DB');

// auth.ts
import { pact } from '@tundralibs/rapid/middlewares/pact';

pact({
  hooks: {
    getUser: (q) =>
      q.by === 'IDENTIFIER'
        ? db.repo('Users').findOne({ '@email': q.identifier })
        : q.by === 'ID'
        ? db.repo('Users').findOne({ '@id': q.id })
        : db.repo('Users').findOne({ '@oauthSub': q.subject }),
    createUser: (d) => db.repo('Users').insert(d),
    updateUser: (id, p) => db.repo('Users').update(p, { '@id': id }),
    getApiKey: (id) => db.repo('ApiKeys').findOne({ '@id': id }),
    saveApiKey: (r) => db.repo('ApiKeys').upsert(r),
  },
  Bearer: { HeaderName: 'authorization' },
});

// main.ts
Doctor.stock(DB, db); // pact() already stocked PACT internally
app.modules(Modules);
```

```ts ignore
// a module: norm for data, the pact seam on routes
import { authenticate, authorize } from '@tundralibs/rapid/middlewares/pact';

class PostsModule extends BlogModule {
  private readonly db = inject(DB);
  @GET('/posts')
  list = () => this.db.repo('Posts').find({ '@published': true });
  @POST('/posts', { middleware: [authenticate(), authorize('Post', 'WRITE')] })
  create = (ctx) =>
    this.db.repo('Posts').insert({
      ...ctx.args.payload,
      authorId: ctx.auth.id,
    });
}
```

**Hot-path caveat, unchanged from the original design:** `getUser` runs on
every authenticated request (a DB round-trip). Cache it in the app's hook
(`@tundralibs/cacher`) — not by caching the principal in rAPId, which would
bypass pact's revocation checks.

## Pending pact-side changes (not built yet)

Tracked here; built as one pact PR/release **after** this rapid design is
implemented ("finish this, then do that"):

1. **`Pact.signAs(keyId, content)`** (name TBD) — re-fetches the API key's
   stored secret via the existing `getApiKey` hook and HMAC-signs `content`,
   without ever exposing the secret to the caller. Needed for the symmetric
   per-key HMAC response-signing model (chosen over signing with pact's own
   general content key, since the specific caller who signed the request
   needs to verify the response with _their own_ key's secret).
2. **`Pact.can()` / `Pact.assert()` param order** → `(principal, module,
   permission)`, reversed from the current `(principal, permission, module)`
   — for consistency with rapid's own `authorize(module, permission)`.
   **Breaking change to a published (0.5.0, live on JSR) API.**

## Considered & rejected

- **`app.provide/get` sugar** — service-locator/god-object abuse magnet.
- **A separate `usePact()` helper distinct from `Doctor.stock`** — redundant
  once `pact(options)` auto-stocks internally, and risks becoming an
  app-registry write in disguise (the same mistake `app.provide/get` is,
  under a friendlier name).
- **`pact(options)` returning bound `{ authenticate, authorize }` closures**
  for route files to import directly — creates a de facto
  single-canonical-import-site convention: safe only if every file imports
  from the one place that called `pact(options)`, and silently wrong (a
  second `Pact` instance) if anyone imports the factory instead. Replaced by
  stateless functions resolving `inject(PACT)` — doctor already solves
  exactly this "construct once, resolve everywhere" problem.
- **A public `can(pact, module, permission)` composability helper** —
  dropped; the indirection (build a predicate, hand it to `authorize`) wasn't
  earning its keep over `authorize` just doing the check itself.
- **Individually-named per-scheme middlewares** (`bearerAuth()`,
  `hmacAuth()`, …) as separate exports — dropped in favor of
  `authenticate(schemes?)`'s restriction-list argument; avoids a
  proliferation of near-identical exports for what's really one behavior
  parameterized by scheme.
- **Widening core's `authenticate<T>` to be generic and reused by pact** — an
  earlier idea, superseded: pact's `authenticate()` needs a response-side
  phase core's `authenticate` doesn't have, so it's a standalone
  implementation rather than a generalization of the core one.
- **Principal cache inside the middleware** — bypasses pact revocation;
  caching belongs in the app's `getUser` hook.
- **Dropping the generic `verify`** — strands BYO-auth developers; layer 1
  stays.
- **Registering pact on the app (core option)** — couples core to pact and
  disadvantages BYO auth.
- **HMAC canonicalization moving into pact** — rejected outright, not just
  deferred. No universal spec exists across real-world HMAC schemes (AWS
  SigV4's sorted-canonical-request chain, GitHub's raw-body-only,
  Stripe's `timestamp.rawBody` concatenation are all incompatible shapes),
  and canonicalization is a transport contract between a specific client and
  server, not an identity concern. It stays app/rapid-owned permanently via
  the `Hmac.canonicalForVerify`/`canonicalForSign` callbacks. Only the raw
  sign/verify primitive belongs in pact — which it already has
  (`sign()`/`verifySignature()`), plus the new `signAs()` above.

## Build scope

Layer 1 unchanged. New `middlewares/pact/` subpath: `pact(options)` (setup),
`authenticate(schemes?)`, `authorize(module, permission)`, internal
(non-exported) scheme extractors + the `ctx.auth` sanitizer. Blog example
wired to norm+pact (a pact route + a BYO-`verify` route side by side). Docs.

Exact `pactOptions` field shape (flat vs. grouped per scheme, eventual
config-file sourcing) is left to implementation-time iteration, not locked
here.

Deferred, not blocking this build:

- The two pending pact changes above (own PR, after this ships).
- `login`/`logout`/`refresh`/OAuth endpoint helpers.
- How pact's storage hooks relate to rapid's existing `Store<V>` seam —
  discuss once this is implemented.
