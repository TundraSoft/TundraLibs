# rAPId Review — 2026-09-01

**Date:** 2026-09-01 · **Scope:** full package audit of `packages/rapid`
(Application, transports, context, middlewares [excl. `middlewares/pact/`],
utils, endpoints, decorators, modules, ui, types, docs, examples).
Excludes `middlewares/pact/`, benches. Method: six parallel dimension
reviewers (correctness/transports, middlewares, utils/endpoints, UI-security,
duplication/dead-code/docs-truth, consumer-usability) + a UI
usability/scalability lens; every finding traced to source, many verified by
running probes against the real package. Findings ordered by severity.

## Summary

The package is, on the whole, careful and well-defended: the static-file
traversal guards (lexical + `realPath` symlink), the upload gauntlet
(fail-safe empty allowlist, server-minted ULID names), timing-safe HMAC,
escape-by-default `html` with a single greppable `raw()`, HEAD handling,
`Vary` cache care, and documented per-runtime degradation all held up under
attack. **No dead exports** and **no cross-runtime global leaks** were found.

The real problems cluster in the **newest code** — the "tiers round"
(config split, three-tier UI, `server.static`, history, lazy sessions) and
`idempotency()`. The headline items: `idempotency()` can replay one user's
response to another (no identity in the key), lazy `session()` can wipe a
live session on a transient store error, and a stringly-typed key in the
YAML `ui:`/`server.static` bags boots clean then 500s every page. Several
docs shipped this round are false (they document APIs that were renamed or
deprecated in the same round). A duplication cluster (compat helpers copied
into `utils/`, already drifting) is worth paying down now.

## Resolution (2026-09-01)

All 23 findings were dispositioned the same day, on
`feat/rapid-review-and-modules` (single hardening commit; every fix
carries a regression test that fails on the pre-fix code).

- **Fixed in code — the 4 HIGH:** `idempotency()` now REQUIRES an
  identity `scope` (or an explicit `scope: false` for shared key
  spaces), caps keys at 255 chars, skips unmatched requests, and bounds
  its default store (`maxRecords`, FIFO eviction). `session()` gates the
  save phase on a completed load (a store blip can no longer wipe a live
  record). `__configureUi` and `normalizeStaticConfig` validate against
  closed key sets and boolean-check the gates (typos and code-half
  names now fail the boot).
- **Fixed in code — MEDIUMs:** template-less errors negotiate `Accept`
  when `errorTemplates` are configured (browsers get the 404 page, API
  clients keep the envelope, Accept joins Vary); identity-bearing pages
  stamp `Vary: Cookie` + `Cache-Control: private`; history stamps the
  initial entry `page: true` (navigation restore), guards non-GET
  pushes, and wraps `pushState`; `compress()` skips 206/Content-Range;
  malformed multipart is a 400; SSE strips/splits bare CRs; `stop()`
  removes the uploads dir only after the drain; the error finalize path
  runs upload cleanup; signed `setCookie` queues through the reply
  channel (no droppable promise; sync handlers work); `JOBTransport.stop`
  awaits in-flight firings bounded by the drain window; `formState`
  rethrows unrecognized throws; session loads clone (no memory-store
  aliasing) and `destroy()` evicts a regenerated-away record, with the
  save phase running on the throw path too; idempotency records are
  structured-cloned at store and replay and `release()` is awaited and
  never-throwing; `mode` is normalized/validated; late `route()`/`use()`/
  `socket()`/`job()` throw once the router snapshotted.
- **Fixed in code — LOWs/hygiene:** replaced stream bodies are
  cancelled; `assetVersion` stats before reading and `continue`s per
  mount; the swap runtime origin-gates its primary fetch and is
  double-load idempotent; title/meta callbacks run under the
  template-render diagnostics; `parseCookies` is null-prototype; the
  fetch-only path warns on declared channels; `negotiate`/`parseRange`/
  `parseCookies` now come from `@tundralibs/compat/http`
  (`serializeCookie` is a thin RapidError-translating wrapper);
  `ifNoneMatch`/`isThenable`/`djb2` unified under `utils/`; the Vary
  regexes are cached; missing barrel exports added.
- **Fixed in docs:** the five false docs corrected (history push API,
  `meta` placement, strict-CSP recipe, scaffolded AGENTS.md, etag
  ordering prose); README documents `scope`, `--ui`/`--with`, the
  `./ui` export, and the per-process default-store limit; Rapid-UI.md
  states the synchronous whole-string rendering ceiling.
- **Documented as accepted trade-off (not code-fixed):** the csrf
  double-submit token is not session-bound — caveat + mitigation now in
  `csrf.ts`'s fileoverview (defense-in-depth behind SameSite; low).

## Findings

### HIGH — `idempotency()` replays one user's response to another (no identity in the key)

**Location:** `middlewares/idempotency.ts:181`
**Failure scenario:** the replay key is `` `${ctx.action} ${clientKey}` `` —
route _pattern_ + the attacker-controlled `idempotency-key` header, with no
caller identity. User A POSTs `/orders` with `idempotency-key: k1`, gets a
reply containing private data; anyone replaying that header on the same route
within `ttlMs` (default **24h**) receives A's stored body verbatim. The
module's own docs say register it "EARLY (outer), before anything that must
NOT re-run on a replay" — placed outside `authenticate`, the replay
short-circuits before auth runs, so it is available unauthenticated. Because
`ctx.action` is the pattern, it also replays across `/posts/:id:` ids.
**Fix:** mix an identity scope (auth subject / session id / API key) into the
key; or add a required `scope: (ctx) => string` option and refuse to run
without it. Document that the key is per-identity.

### HIGH — lazy `session()` wipes a live session when the store read fails

**Location:** `middlewares/session.ts:191-200`
**Failure scenario:** with an async (redis) store, `verifySignedValue` sets
`id`, then `store.get(id)` rejects on a transient blip → the `load()` promise
rejects and the handler 500s. The save phase does `await loading.catch(()=>{})`
but then hits `id !== undefined && rolling` (true) and writes
`{ data: {}, createdAt: now }` over the real record, re-issuing the cookie.
One store hiccup permanently erases the session; the comment "a failed load:
nothing to save" is not enforced by any guard.
**Fix:** set a `loaded = true` at the end of `load()` (or null `id` in a
catch); skip the entire save phase unless the load completed.

### HIGH — a stringly key in the YAML `ui:` / `server.static` bag boots clean, then fails at request time (and typos silently no-op)

**Location:** `Application.ts` `__configureUi` (data-half spread) ·
`utils/staticFiles.ts` `normalizeStaticConfig`
**Failure scenario:** `Application.yaml` with `ui: { core: ./templates/core.ts }`
(a plausible attempt — YAML can't carry a template) rides `...data` into
frozen `__ui.core` unchecked; boot succeeds; the representer then calls
`tpl.render()` on a string → `RAPID_TEMPLATE_RENDER` 500 on **every**
templated page in production. Separately, an unknown key — `ui: { histroy: true }`,
`server.static: { '/x': { rooot: 'y', fingerprnt: true } }` — is silently
dropped: the feature just never turns on (verified: history route 404s,
`fingerprint` stays false, immutable caching + `view.asset()` hashing
silently lost). Both violate the package's own "config fails as loudly as
code" contract, and TS excess-property checks can't reach the YAML path.
**Fix:** in `__configureUi`, reject code-half keys (`core`/`layout`/`view`/
`errorTemplate(s)`/`assets`) present in the data half, and reject unknown
data keys, naming the key; add closed-key validation to `normalizeStaticConfig`
entries.

### HIGH — `idempotency()` + default `memoryStore` grows unbounded on attacker-minted keys

**Location:** `middlewares/idempotency.ts:175,219` · `middlewares/store.ts:52`
**Failure scenario:** an unauthenticated attacker loops POSTs to any public
2xx route with random `idempotency-key` values (each up to the header cap,
~8-16KB); each stores a full reply record with a 24h TTL, and `memoryStore`
prunes only _expired_ entries — per-process memory grows without bound for a
day → OOM. (The middleware also composes on the no-match chain, so unique
paths compound it.)
**Fix:** cap key length; bound the default store (LRU / max-entries) or lower
default `ttlMs`; skip unmatched requests; document the in-memory default's
exposure and steer public surfaces behind auth + rate limit.

### MEDIUM — `errorTemplates` never render for the commonest error (a browser hitting an unknown URL), contradicting the docs

**Location:** `ui/represent.ts:424` · docs `docs/Rapid-UI.md`
**Failure scenario:** with `ui: { errorTemplates: { 404: NotFound } }` and
per-route `prefer` (as the docs advise), a browser navigation to an unknown
URL has no `routeTemplate`, so `prefer` resolves to `'json'` and represent
returns the raw JSON envelope (verified: `content-type: application/json`) —
while the docs promise "a UI-configured app never shows a browser a raw JSON
envelope."
**Fix:** when `errorTemplates` is configured, resolve non-swap errors on
template-less requests to HTML; or correct the docs to state error pages
require app-wide `prefer: 'html'`.

### MEDIUM — pages exposing `view.csrfToken` are cacheable without `Vary: Cookie` → one user's CSRF token served to another

**Location:** `ui/represent.ts:115,137`
**Failure scenario:** `prefer: 'html'` + `csrf()`; a returning user's GET has
no `Set-Cookie` (csrf issues only when absent), so the page is heuristically
cacheable, stamped only `Vary: rapid-swap`. A shared cache/CDN serves user
A's page — with A's signed token — to user B; B's posts then fail
`RAPID_CSRF_INVALID` (availability break) and A's token is disclosed.
**Fix:** when the built view exposes `csrfToken` (or any per-request identity
field), add `Cookie` to `Vary` and/or set `Cache-Control: private, no-store`.

### MEDIUM — the history module restores the _page_ into a _fragment region_ on back-to-start

**Location:** `ui/history.ts` (initial-entry `replaceState`)
**Failure scenario:** the first push stamps the initial entry as
`{ url: <page url>, target: <#region> }`. Pressing Back to the start
re-fetches the page URL _with the swap header_ → the representer returns the
page's whole fragment → swapped into `#region` → nested/duplicated UI.
Repro: kanban `/board/ui` → click an owner chip (pushes) → Back.
**Fix:** mark the initial entry `page: true`; popstate does `location.assign`
for page entries (an honest full navigation to start).

### MEDIUM — `compress()` gzips 206 partial responses, corrupting range/resume

**Location:** `middlewares/compress.ts:27,103`
**Failure scenario:** `app.use(compress())` + `server.static` (or `ctx.serve`);
a `Range: bytes=5-9` request that also sends `Accept-Encoding` gets a 206
whose `Content-Range` describes identity byte positions while the body is
gzip of the slice and `content-length` is dropped (`NO_BODY` = {204,205,304}
only) → resumption/seeking reassembles garbage.
**Fix:** bail on status 206 / presence of `content-range`.

### MEDIUM — malformed multipart body → 500 instead of 400

**Location:** `utils/parseBody.ts:228`
**Failure scenario:** `Content-Type: multipart/form-data` with no `boundary`
(trivial); `await response.formData()` throws a raw `TypeError` _above_ the
error-mapping try (line 229) → classified `RAPID_UNHANDLED` (500) and logged
as a fake internal error, while the sibling malformed-JSON path correctly
maps to 400. Runtimes also disagree on when this throws.
**Fix:** move `response.formData()` inside a try that maps the throw to
`RAPID_VALIDATION_FAILED` (400), keeping the file-cleanup on rethrow.

### MEDIUM — SSE framing leaves a bare `\r`, enabling event/field injection

**Location:** `utils/streams.ts:74`
**Failure scenario:** an app streams user content through `ctx.sse()`; a value
containing `\revent: session-expired\rdata: {"logout":true}` is framed with
the `\r` intact, and `EventSource` (which treats a lone CR as end-of-line)
reads a spoofed `event:` with attacker data. `event`/`id` are unsanitized too.
**Fix:** split `data` on `/\r\n|\r|\n/`; strip CR/LF from `event`/`id`.

### MEDIUM — `Application.stop()` deletes the owned uploads dir _before_ the graceful drain

**Location:** `Application.ts:1567`
**Failure scenario:** SIGTERM → `stop()` runs `await remove(ownedUploadPath)`
first, then drains in-flight HTTP; a request mid-multipart-parse writes into
the just-removed dir → ENOENT → 500 during the very window the drain exists
to protect.
**Fix:** move the owned-dir removal _after_ `http.stop(drainMs)` (keep it in
the not-started early return).

### MEDIUM — upload temp files leak on the reply-cookie failure paths

**Location:** `transports/HTTPTransport.ts:605-616`
**Failure scenario:** a route parses a multipart body (temp files written)
then returns `{ cookies: [{ name: 'a b', … }] }` (or `{ signed: true }` with
no app `secret`) → `serializeCookie`/`app.secret` throws → `__finalize`
returns `__errorResponse` directly, and the `detach(cleanup())` step (only in
`__materialize`) never runs → temp files never unlinked; with a user-supplied
`uploads.path`, `stop()` doesn't sweep them either → per-request disk leak.
**Fix:** run cleanup in `__errorResponse` (or wrap finalize in a shared
`finally`).

### MEDIUM — a dropped signed-cookie promise crashes the process

**Location:** `context/HTTPContext.ts:521`
**Failure scenario:** a sync handler calls `ctx.setCookie('sid', v, { signed: true })`
without awaiting (natural — the unsigned overload is fire-and-forget); the
request finalizes synchronously and freezes the context, then the HMAC
resolves and `.then` calls `appendHeader` → `_assertNotResponded()` throws
inside the discarded promise → unhandled rejection → process exit.
**Fix:** queue the signed cookie for `_applyReplyCookies` (like the reply
`cookies` channel) instead of appending inside a caller-owned promise.

### MEDIUM — `JOBTransport.stop()` abandons running jobs before module dispose

**Location:** `transports/JOBTransport.ts:71`
**Failure scenario:** a scheduled job is mid-run using a module-owned pool;
SIGTERM → `cronus.stop()` only clears timers (never awaits running jobs) →
HTTP drains → `__disposeModules()` closes the pool → the still-running job's
next module call fails / half-commits. The "modules go last" ordering covers
HTTP but not jobs.
**Fix:** track in-flight `__run` promises in JOBTransport and await them
(bounded by the drain window) in `stop()`.

### MEDIUM — `formState()` turns any `.parse` throw into a 200 form error, leaking internal messages

**Location:** `ui/formState.ts:50-58`
**Failure scenario:** the package's `validated()` policy makes non-guardian
throws opaque 500s ("a server bug"); `formState` instead catches _every_
throw and renders `'(root)': cause.message`, so a bug in a custom
`.parse`/zod transform ships `"Cannot read properties of undefined…"` into
PRODUCTION HTML as a user-facing form error.
**Fix:** apply the guardian recognizer — only `RAPID_VALIDATION_FAILED`/
guardian failures become the error arm; rethrow anything else.

### MEDIUM — `memoryStore` session load aliases the stored object (mutations persist / diverge from redis)

**Location:** `middlewares/session.ts:148-149` · `store.ts:49`
**Failure scenario:** `({ data } = rec)` aliases the object in the store's
`Map`; `s.set('role','admin')` mutates it in place, so the write is visible
to later requests even when the save phase is skipped (e.g. handler throws) —
while a serializing (redis) store loses the same write. Divergent semantics
across the two documented backends.
**Fix:** `structuredClone` the record's `data` on load.

### MEDIUM — idempotency stored `reply.content` is shared by reference with the live response and every replay

**Location:** `middlewares/idempotency.ts:192,214`
**Failure scenario:** the stored record holds the handler's content object
itself; replay spreads only the top level. An outer middleware that stamps
`content.links`/`content.requestId` in place mutates the store record — the
first attempt's mutation bakes into all replays and compounds per replay.
**Fix:** `structuredClone` the reply when storing and when replaying.

### MEDIUM — idempotency `release()` fire-and-forgets an async store call

**Location:** `middlewares/idempotency.ts:115-121`
**Failure scenario:** redis store, handler throws, `release` runs
`void store.delete(key)`; the delete rejects on the same outage →
unhandled rejection (process-fatal). It's also un-awaited before the rethrow,
so an immediate client retry can still find the `pending` marker → spurious
409.
**Fix:** `.catch()` (log) and await release on the throw path before
rethrowing.

### MEDIUM — `mode` is never validated: `mode: development` silently runs as PRODUCTION

**Location:** `Application.ts:225` (getter) · `__validate`
**Failure scenario:** a consumer writes `mode: development` (natural YAML
casing); `__validate` checks name/secret/port/paging but not `mode`, the
getter returns it verbatim, and every `=== 'DEVELOPMENT'` comparison fails →
the app runs with PRODUCTION disclosure and INFO logging with no hint why.
**Fix:** validate/normalize `mode` against the two-value enum in `__validate`,
consistent with `prefer`'s loud validation.

### MEDIUM — late `route()`/`use()`/`module()` after start is accepted silently and never served

**Location:** `Application.ts:793`
**Failure scenario:** a consumer awaits a plugin and calls `app.get('/late', …)`
after the first request; registration succeeds without error yet the route
404s forever (the router snapshots at prepare). `__configureUi` already
throws for exactly this hazard — an internal inconsistency with a silent
failure mode.
**Fix:** throw `RAPID_CONFIG` from `route()`/`use()`/`module()`/`socket()`/
`job()` once prepared, mirroring `__configureUi`.

### MEDIUM — four `utils/` helpers duplicate `@tundralibs/compat/http`, and one has already drifted

**Location:** `utils/negotiate.ts` · `utils/staticFiles.ts` (`parseRange`) ·
`utils/cookies.ts` (`parseCookies`, `serializeCookie`)
**Evidence:** compat/http now exports `negotiate` (:254), `parseRange` (:293),
`parseCookies` (:344), `serializeCookie` (:374) — byte-identical algorithms;
`serializeCookie` has already drifted (compat throws `TypeError`, rapid throws
`RapidError` and adds the `signed` option). REVIEW-3 recorded the promotion
plan; these copies were never deleted. rapid already imports
`contentTypeFor` from compat/http.
**Fix:** import `negotiate`/`parseRange`/`parseCookies` from compat and delete
the copies; keep `serializeCookie` as a thin wrapper adding `signed` +
RapidError translation.

### MEDIUM — docs shipped this round are false (APIs renamed/deprecated in the same round)

**Location:** `types/UiConfigOptions.ts:39` · `docs/Rapid-UI.md:194-198` ·
`docs/Rapid-UI.md:542` + `types/View.ts:258` · `cli/templates.ts:359` ·
`middlewares/etag.ts:7`
**Evidence:** (a) the `history` JSDoc documents `rapid.swap(..., { push: true })`
— no such API; the real one is `rapid.history.push()`. (b) the `meta` doc
example places `meta` at the decorator's top level, where it doesn't exist
(it lives inside the `template` object) — copied verbatim it errors or
silently drops all tags. (c) the Strict-CSP recipe (and `View.ts` JSDoc) use
`app.ui({ view })`, which now _throws_ `RAPID_CONFIG` on any app that
configured `ui` at initialize. (d) the scaffolded `AGENTS.md` teaches the
deprecated `app.ui()`. (e) etag's JSDoc says "order it OUTSIDE compression"
while its own example registers it correctly _inside_ — a reader following
the prose gets a silent no-ETag. Docs ship in the tarball, so each is a
correctness bug.
**Fix:** correct each to the shipped API.

### LOW — assorted (verified, lower impact)

- **`context/Context.ts:258`** — `_setBaseResponse` overwrites a stream body
  without cancelling it → FD leak when an error path replaces a
  static/`serve` response. Cancel replaced stream bodies.
- **`Application.ts:1391`** — `assetVersion()` reads bytes _before_ stat'ing
  mtime (DEV: an edit between the two caches a stale hash under the new
  mtime), and returns `undefined` instead of `continue` on a per-mount miss
  (overlapping fingerprinted mounts lose caching). Stat first; `continue`.
- **`ui/ui.ts:119`** — the swap runtime origin-gates _server redirects_ but
  not the primary `fetch(url)`; a request-derived `data-action` fetches
  cross-origin, `innerHTML`-injects the response, and ships `x-csrf-token` to
  the attacker. Gate the initial fetch same-origin like the redirect guard.
- **`ui/ui.ts`** (IIFE top) — the swap runtime lacks the idempotent
  double-load guard `live.ts:38`/`history.ts:39` have; loading
  `/__rapid/ui.js` twice attaches duplicate click/submit listeners (double
  fetch, double POST). Add `if (window.rapid && window.rapid.swap) return;`.
- **`ui/history.ts`** — non-GET swaps are pushable (a form `data-push` mints
  an entry whose restore GETs the POST action → 405 → full-page error);
  guard `detail.method !== 'GET'`. And `pushState` isn't wrapped in
  try/catch, so a cross-origin/invalid pushed URL throws and silently kills
  back navigation; wrap it.
- **`ui/represent.ts`** (title/meta callbacks) — invoked outside
  `renderChecked`, so a throwing `title:(d)=>…`/`meta:(d)=>…` escapes as a
  bare 500 without the `RAPID_TEMPLATE_RENDER` diagnostic. Wrap them.
- **`middlewares/session.ts`** — `destroy()` after `regenerate()` never
  evicts the pre-regenerate record (fixation window survives); no try/finally
  around `next()` (logout-then-throw stays logged in). Honor `evict` in the
  destroyed branch; run save in a `finally` guarded by the load-success flag.
- **`middlewares/csrf.ts`** — the double-submit token isn't session-bound, so
  cookie-tossing lets a token be reused across clients (defense-in-depth
  behind SameSite, hence low). Bind the sid into the signed payload when
  `session()` is present, or document the caveat.
- **`utils/cookies.ts:64`** — `parseCookies` returns `{}`, not
  `Object.create(null)`; `ctx.cookies['toString']` returns the inherited
  Function for a cookie never sent (the other parsers all null-proto with a
  comment explaining exactly this). Match them.
- **`__prepareFetch`** — warns for `ui.live` on the fetch-only path but
  silently accepts declared `channels` (equally unreachable; `publish()`
  no-ops). Warn/throw consistently.
- **Duplication (no drift yet):** `If-None-Match` weak comparison ×3
  (`etag.ts`, `staticFiles.ts`, `__scriptRoute` inline); `isThenable` ×4 +
  inline variants with differing guards; djb2 ×2 (`hashBytes` bytes vs
  `contentHash` charCodeAt). Unify into `utils/`.
- **Barrel/JSDoc hygiene:** `RapidApplicationStaticConfig`/`…StaticEntry`
  missing from the root barrel (every sibling option type is there);
  `Application.ts:1669` orphaned exporter JSDoc block (leftover);
  `buildView`/`ui.ts` fileoverviews carry stale `app.ui()` /
  "(a later build step)" references; README omits `./ui` from the exports
  list and `--ui`/`--with` from the CLI section.
- **Perf micro:** `stampVary` compiles a RegExp per configured name per
  templated request (hoist per-app); first render after boot pays serial sync
  file reads to warm the `assetVersion` cache (document).

## Scalability & the UI layer (special lens)

The UI layer's architecture scales well _for what it targets_ — server-rendered
pages and fragment swaps — and the "same route, both representations" core is
its best property. Two structural limits worth stating in the docs rather than
fixing: (1) rendering is **synchronous and whole-string** — a page is built
entirely in memory before the first byte, so it does not stream HTML; fine for
admin/CRUD scope, a ceiling for very large pages. (2) `idempotency()` and
`session()` and `rateLimit()` all default to a **per-process `memoryStore`**
that only prunes on expiry — every one of them needs a shared, bounded store
to scale past one replica, and the idempotency + memory finding above shows
the unbounded-growth failure mode. The history module's no-DOM-cache design is
the right scalability call (re-fetch keeps auth/`Vary`/etag in the path), but
its two functional bugs (page-into-region restore, non-GET push) need fixing
before it's usable. Config-driven static serving on route-miss is a genuine
scalability win (routed requests skip the `stat`), and lazy sessions removing
store I/O from asset/health requests is exactly right — once the failed-load
overwrite is fixed.

## What's already solid

- **Security fundamentals:** static traversal (lexical + `realPath`) held
  under `../`/`%2e%2e`/`%2f`/symlink probes; upload gauntlet fail-safe;
  timing-safe HMAC; escape-by-default `html` with symbol-branded `Html` (JSON
  data can't impersonate trusted markup) and honest docs on escaping's limits;
  disclosure collapse (`debug`/5xx stripped before any error page); the
  `rapid-title` header is encode/decode'd and only ever reaches `document.title`.
- **Correctness care:** HEAD end-to-end (stream cancelled, real
  content-length); `SAFE_REQUEST_ID` applied even to user generators; metric
  cardinality collapse on unmatched paths; the sync-path read-modify-write
  atomicity in `rateLimit`/`idempotency` `claim`; `Vary` merging on both
  success and error paths; the pre-`next()` header-diff + set-cookie exclusion
  in idempotency; boot-time `stateKeyGuard`.
- **Hygiene:** no dead exports; no cross-runtime global leaks anywhere;
  cookie handling centralized behind `HTTPContext`; brand-gated `initialize()`;
  fail-fast template validation with route labels in every error.
