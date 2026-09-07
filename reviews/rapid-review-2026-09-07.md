# rAPId Review — 2026-09-07

**Date:** 2026-09-07 · **Scope:** full package audit of `packages/rapid` on
`feat/rapid-review-and-modules` (main merged in 2026-09-06; the surfaces
round — `server.api`, `ctx.surface`, `ui.enabled: false` ≡ all-api —
included, uncommitted). Covers Application, transports, context,
middlewares, utils, ui (server + the three client scripts), modules /
decorators / DI, endpoints, cli, testing, docs, examples, manifests and
publish hygiene. `middlewares/pact/` is reviewed only as a docs-truth item:
it is known-broken against pact 0.7.0 and queued for a rewrite.
**Method:** seven parallel dimension reviewers (transports/boot/surfaces ·
context/request utils · middleware catalog · UI server+client · modules/DI ·
cli/endpoints/testing/runtime hygiene · docs truth/API consistency), each
under the verify-before-report rule with a mandatory refutation attempt;
every finding below was reproduced with a probe against the real package or
traced to the exact source lines, and the highs were re-verified by the
consolidator. Findings ordered by severity. **Status: RESOLVED same day** —
see the Resolution section.

## Summary

The core held up well — better than on 2026-09-01. Every XSS vector against
the escaper, the error page, `htmlDocument`, the swap runtime's sinks and
the `rapid-redirect` origin gate failed; static traversal (percent, overlong,
NUL, backslash, `..`), Range abuse, cookie injection, signature forgery,
query-parser DoS, prototype pollution through payload → binder, cross-app DI
isolation, PRODUCTION disclosure collapse, double-finalize, and every
hidden-page oracle on the new api surface (HEAD, OPTIONS/`Allow`, metrics
identity, span names, logs, route middleware) all came back closed. No
runtime-only global leaks; the review/design files inside the package are
publish-excluded.

The problems are of three kinds. **(1) Three real core bugs**, each in a
guarantee the docs advertise: the new scheme-relative redirect guard is
bypassed by an ASCII tab; `idempotency()` + `timeout()` in the documented
order releases the key on a 504 while the detached handler is still running,
so a retried `POST /charge` charges twice; and a route-bound module method's
`this.invoke()` never receives the request's `auth`/`state`, so the
"`ctx.auth` rides the invoke seed" feature does not work. **(2) The
periphery is broken for a new user**: the default `--module` scaffold fails
its own `deno check`, the bun/node/workers scaffolds cannot `npm install`
(no `.npmrc` for the `@jsr` scope), the `--norm` scaffold is wrong three
ways, `endpoints/login.ts` models a pact contract that never existed, and the
generated `AGENTS.md` teaches five wrong sibling-package APIs. **(3) Two
session/csrf interaction bugs the swap UI will hit in normal traffic**: a
rolling session save writes back the whole stale snapshot a read-only request
loaded (a parallel write is erased), and the session-bound csrf token is not
re-issued on the response that mints/rotates the session, so the first POST
after session creation, login or logout fails with 403 (and the no-JS form
recipe renders an empty/stale `view.csrfToken` on exactly those pages).

Counts: **7 high · 16 medium · ~28 low**. Nothing critical.

## Resolution (2026-09-07)

Dispositioned the same day on `feat/rapid-review-and-modules`; every code
fix carries a regression test that fails on the pre-fix code. Suite after:
119 passed / 757 steps (Deno), the changed areas green on Bun and Node.

- **Fixed — the highs.** Redirect guard now resolves against a sentinel
  origin (tab / leading-space bypass closed). `idempotency()` keeps the key
  PENDING across a timeout in EITHER order — the review's claim that the
  outer-timeout order "records the late reply" was itself wrong: the
  finalized context's status was already 504, so it recorded a POISONED
  reply and replayed a 504; now `ctx.responded` (new public getter) gates
  both the release and the record. Route-bound `RapidModule` methods seed
  the ambient frame (`_seedRequestFrame`) so `this.invoke()` inherits
  `auth`/`state`/`requestId`. The `--module` scaffold binds its param;
  npm-shaped scaffolds get `.npmrc`; `--norm` declares the dependency and
  uses `Entity`/`Column`/`Schema` + the sqlite engine import; a
  generate-then-`deno check`+`lint` test guards all three. The pact adapter high is FIXED too (same day, after the audit): `middlewares/pact/` is now one factory `pactAuth(pact, options) → { authenticate, authorize }` on pact 0.7's real API (typed `authorize`, one `WWW-Authenticate` challenge, absent → anonymous / present-but-invalid → 401), `login()` sits on pact's real `login()` contract with an optional HttpOnly cookie, Rapid-Auth.md is rewritten, the blog example runs, and the generated AGENTS.md describes the shipped shape. Tests drive a REAL `Pact` instance. Still pending on the pact side: the shared-core factory the hono/oak/express/fastify adapters would wrap (a pact PR).
- **Fixed — the mediums.** Rolling sessions slide the window via a new
  optional `Store.touch()` (fallback: re-set the CURRENT record) instead of
  writing back a stale snapshot; `csrf()` re-issues its token on the SAME
  response that mints/rotates the session (via `SESSION_ISSUED` /
  `CSRF_TOKEN` request marks) and `view.csrfToken` is the token valid for
  THIS response — `csrf()` must be registered outside `session()`
  (documented). Concurrent `stop()` is memoised. `compose` owns an abandoned
  `next()`'s rejection (logged). `uploads.maxFiles` (default 20) + the
  multipart cap falls to `maxBodySize` when no extension is allowed. Static:
  nested directory `index` serves, a re-pointed symlinked root re-resolves,
  `If-Range` honoured. `app.module(new RapidModuleSubclass())` throws;
  `param()` rejects non-strings off HTTP; `dispose()` has a DRAINING phase;
  a constructor with required parameters fails `initModules`. History uses
  `CSS.escape` and guards the restore lookup. Unmatched-URL error
  negotiation is two-way when `errorTemplates` exist (a JSON client of a
  pages-first app keeps the envelope). AGENTS.md's norm/slogger/crypt/
  guardian/workers sentences corrected; README sibling-install notes, CI
  sentence, "runtime first" corrected.
- **Fixed — lows.** `requestIdHeader` validated at boot; `server.api.
  trustForwardedHost` is an explicit opt-in (never implied by `trustProxy`);
  `triggerJob` documents the overlap-guard bypass; signed cookies are bound
  to their NAME (`name\0value`) and an empty signed value round-trips;
  `allowedExtensions` and `uploads.maxFiles` validated; strong `ETag`s are
  weakened by `compress()`; swap-redirect replies get the personal-cache
  stamps; `outer` swaps load lazy regions on every new root; the CSP recipe
  notes `DefaultErrorPage`'s inline styles; the `ui.view` projection runs
  under render diagnostics; harness/`@Use`/autobind messages corrected;
  project names validated; unknown rapid version pins nothing; duplicate
  module class names fail the barrel; ROADMAP phantom `permission`/`jwt`
  and runtime size, the `Accept` heading, "two functions" phrasing fixed.
  App-level durations are now SECONDS: `shutdownTimeout` (1–30, default
  25), `server.static.maxAge` (0–1 year), cookie `maxAge` (0–400 days) —
  validated.
- **Deferred, recorded.** BREACH masking of the csrf token and the
  middleware duration units (`session.idleTtl`/`absoluteTtl` are still ms,
  unsuffixed) → the pact/middleware round starting next. `--with` download
  hashing → a later CLI pass.

## Suggested order

1. H1 redirect guard (small, security) · H2 idempotency/timeout · H3 invoke
   seed · M1/M2 session+csrf pair (one root cause, three symptoms).
2. The scaffold set H5–H7 + M13 (all reproducible by a generate-then-check
   test, which is the fix's regression guard) · H4 rides the pact rewrite.
3. The remaining mediums; the lows as a sweep.

---

## Findings

### HIGH — the scheme-relative redirect guard is bypassed by an ASCII tab

**Location** `context/HTTPContext.ts:676` (response setter) ·
**Confidence** high (reproduced end to end).

**What** The guard tests `/^[\\/]{2}/` on the raw string. Browsers (WHATWG
URL) strip ASCII tab/newline from the input _before_ parsing, and
`Headers.set` accepts an interior tab, so `/\t/evil.example/x` passes the
regex, reaches the wire, and resolves to `https://evil.example/x`. A leading
space is stripped by `Headers` normalisation too, so `' //evil'` lands as
`//evil`.

**Failure scenario** The pattern the JSDoc names as protected —
`ctx.redirect('/' + userInput)` — with `?next=%09%2Fevil.example%2Fpwn` →
`302 Location: "/\t/evil.example/pwn"`; the browser lands on
`https://evil.example/pwn`. The plain `//evil.example` control correctly
500s.

**Fix** Do what the browser does: resolve against a sentinel origin and
compare hosts (`const u = new URL(url, 'http://rapid.invalid'); if
(u.host !== 'rapid.invalid') throw …`), applied when `url` is not already an
absolute URL with an explicit scheme. Add the `%09` and leading-space cases
to the redirect test.

### HIGH — `idempotency()` outer + `timeout()` inner: a retry after a 504 executes the handler twice

**Location** `middlewares/idempotency.ts:324-328` with
`middlewares/timeout.ts:53-75` · **Confidence** high (probe: first=504,
retry=504, handler runs=2; reversed order: first=504, retry=409, runs=1).

**What** On a `RAPID_TIMEOUT` rejection the `catch` branch `release()`s the
pending marker as if the attempt had failed — but `timeout()` only stopped
_waiting_; the handler is still running, detached. The key is free while the
first charge is in flight.

**Failure scenario** `app.use(idempotency({ scope }), timeout(5000))` —
exactly the order the JSDoc prescribes ("Register EARLY (outer)") and the
README shows. `POST /charge` with `idempotency-key: k` hits a slow PSP → 504.
Every sane client retries a 504 with the same key → claim succeeds → second
charge. The one scenario idempotency keys exist for double-executes.

**Fix** (a) In the catch, when `RapidError.from(error).code ===
'RAPID_TIMEOUT'`, do NOT release — rethrow and let the pending marker stand
(a retry gets an honest 409 until `pendingTtlMs`). (b) Document in both
JSDocs that `timeout()` belongs OUTSIDE `idempotency()` (the inner ordering
records the late reply and replays it — proven to work today).

### HIGH — request identity/state never reaches a nested `invoke()` from a route-bound module method

**Location** `utils/mountModule.ts:239-245` (`buildInvoker` →
`fn.apply(instance, args)` outside any runtime frame),
`modules/ModuleRuntime.ts:481-501`, `modules/RapidModule.ts:160-169` ·
**Confidence** high (probed).

**What** `Context.ts:117` and `DESIGN-modules.md:248` say `ctx.auth` "rides
the invoke seed", but the HTTP/SOCKET/JOB path never sets one:
`buildInvoker` calls the method outside `__run`, `currentOf()` is
`undefined`, `RapidModule.invoke` takes no seed, and binders never hand the
method `ctx`. There is no way for a decorated module method to flow the
request's `auth`/`state` into a `@Use` guard.

**Failure scenario** `app.use(ctx => ctx.setAuth({ role: 'admin' }))`;
`Shop.@GET('/buy')` calls `this.invoke(Orders, 'create', [1])` where
`Orders.create` has an auth-aware `@Use` guard → the guard sees
`{ auth: undefined, state: {}, requestId: 'REQ-1' }` and 401/403s an
authenticated user (fail-closed, so not a bypass — but the documented
feature is unusable, and a tenant in `ctx.state` is silently dropped).

**Fix** In `buildInvoker`, when `instance` is an attached `RapidModule`,
run the method inside a runtime frame that seeds the parent (`{ requestId,
auth: ctx.auth, state: ctx.state }`) so `invoke()`'s existing
"inherit the parent" logic picks it up; or give `RapidModule.invoke` an
optional `seed` and document forwarding. Add a request → invoke → guard test.

### HIGH — the pact adapter, `endpoints/login.ts` and `docs/Rapid-Auth.md` describe an API pact 0.7.0 does not have

**Location** `middlewares/pact/*` (11 TS errors under `deno publish
--dry-run`), `endpoints/login.ts:17-25,46-59`, `README.md:476-483`,
`docs/Rapid-Auth.md:66-77,103,125-126,134,142,177,186`,
`middlewares/auth.ts:12`, `README.md:751` · **Confidence** certain.

**What / truth (the rewrite's punch list)**

- `pact({ bits, modules, apiKeys: true, hooks, apiKey: {} })` flat shape →
  real: `Pact.create({ bits, modulePermissions, hooks?, options?, name?,
  activeStatuses? })`; `PactOptions` non-generic; `PermissionBits` (not
  `PactPermissionBits`); `Pact<B, M>` takes two generics.
- A `TOKEN` scheme / "five credential schemes" → `PactCredential` is
  BEARER / BASIC / APIKEY / HMAC only.
- `pact.can(principal, module, permission)` → no `can`; `hasPermission` /
  `assert` on `Pact` and on the bound principal.
- `instance.signAs(keyId, content)` → only `sign(content, key?)` /
  `verifySignature`; no per-key-id signing API.
- "`pact.authenticate()` stays anonymous on a bad credential" → 0.7.0
  **throws** `PactError` (`PACT_AUTH_FAILURE_CODES`) and returns
  `PactAuthContext { principal, via, sessionId? }`, never `null`; the
  adapter's `principal !== null` check would turn a wrong password into a
  500.
- `ctx.auth` principal has `status` → `PactPrincipal = { kind, id, grants,
  metadata?, userId? }`.
- Hook shapes: `getApiKey` returns `secretHash` in one doc example and
  `secret` in another; real `PactStoredApiKey` requires `status`, `secret`
  (raw), `grants` (serialised string); `getUser` needs `grants: string`.
- HMAC `canonical` may return `Uint8Array` → `payload` is `string`.
- `@throws {PactDefinitionError}` / "pact's `Permissions.has`" → pact
  exports only `PactError` / `PactErrorCodes`.
- **`login()` endpoint:** `PactLoginLike` models `login(strategy,
  credentials) → { principal, token } | null`; real `Pact.login({
  identifier, password }) → { principal, session: { token, expiresAt } }`
  and throws on failure. README's example fails TS2322; with a cast every
  login is an opaque 500 and the 401 path is unreachable; `strategy` is a
  phantom. The only test uses a fake with the invented shape.
- `deno check --doc-only docs/Rapid-Auth.md` fails (blocks 53-79, 156-185).

**Fix** Rewrite the adapter on `Pact.create`'s real shape (thin adapter in
pact's own hono/oak pattern: `authenticate(pact, { schemes?, optional?,
cookie?, hmac? })` attaching the `PactAuthContext`, `authorize(module,
permission)` on the bound principal, `PACT_AUTH_FAILURE_CODES` → 401, rest
rethrown); retype `login()` to the real contract and map failures to 401;
re-derive Rapid-Auth.md from the code and re-run `--doc-only`; fix the two
"five schemes" strings.

### HIGH — the default `--module` scaffold fails its own `deno check` / CI, and its sample route returns `{}`

**Location** `cli/templates.ts:159-176` (`MODULE_SAMPLE`) · **Confidence**
high (reproduced).

**What** `@GET('/hello/:name:') async hello(name: string)` declares no
`bind`, so the decorator's typing requires a zero-arg method: `TS1241 …
'(name: string) => …' is not assignable to '(this: Greeter) =>
RapidModuleReply'`. `module` defaults to `true`, so most users get this;
`deno task check`, the emitted CI (`deno check main.ts`) and the workers
variant all fail. At runtime `GET /hello/bob` → `200 {}` (`name` is
`undefined`).

**Fix** `@GET('/hello/:name:', { bind: [param('name')] })` + import `param`
from `@tundralibs/rapid/decorators` (which also makes the AGENTS.md sentence
"Bind arguments with `bind: [param('id')…]` … see `modules/Greeter.ts`"
true). Add a scaffold test that `deno check`s a generated module project
against the workspace — the YAML drift test is the right pattern.

### HIGH — `bun` / `node` / `workers` scaffolds cannot install: `.npmrc` is never written

**Location** `cli/templates.ts:230-244` (`PACKAGE_JSON`), `scaffold()` file
map, `cli/commands/init.ts:32-37` (`NEXT` prints `npm install`) ·
**Confidence** high (reproduced with a published sibling package).

**What** The dependency is `npm:@jsr/tundralibs__rapid@^X`, which resolves
only with `@jsr:registry=https://npm.jsr.io`. No `.npmrc` (or bunfig) is
emitted; `grep npmrc cli/templates.ts` → 0.

**Failure scenario** `npm install` → `E404 …/@jsr%2ftundralibs__rapid`;
`bun install` → the same 404. The first command the CLI tells the user to
run fails on three of four runtimes.

**Fix** For `runtime !== 'deno'`, `files['.npmrc'] =
'@jsr:registry=https://npm.jsr.io\n'`; assert it in the three scaffold tests.

### HIGH — the `--norm` scaffold is unusable three ways

**Location** `cli/templates.ts:182-210` (`DB`, `MODEL_SAMPLE`,
`MODELS_BARREL`), `DENO_JSON` / `PACKAGE_JSON` · **Confidence** high
(reproduced).

**What**

- `db.ts` imports `@tundralibs/norm` but neither manifest declares it →
  Deno: `Import "@tundralibs/norm" not a dependency`; npm: not installed.
- `norm.use(BlogSchema)` with a raw `{ Users: { name, columns } }` literal →
  `TS2345 … missing 'name', 'entities'`; norm's schema is `Entity(...)` +
  `Schema(name, {...})`.
- `dialect: 'sqlite'` without `import '@tundralibs/norm/engines/sqlite'` →
  `ENGINE_NOT_REGISTERED` at boot (sqlite is deliberately not in norm's
  barrel).
- `models/Users.ts` imports `Norm` unused → the emitted CI's `deno lint`
  fails.

**Fix** Add the norm dep to the chosen manifest when `norm` is on; rewrite
the sample with `Entity` / `Column` / `Schema`; add the sqlite engine import;
drop the unused import; cover `--norm` in the generate-then-check test.

---

### MEDIUM — rolling `session()` save overwrites concurrent writes (lost update on read-only requests)

**Location** `middlewares/session.ts:229-242` · **Confidence** high (probe:
write replied `{ k: 2 }`; a concurrent read-only request that loaded earlier
and finished later left the store at `{ k: 1 }`).

**What** With `rolling: true` (default) a request that merely _read_ the
session re-writes the whole `structuredClone(data)` snapshot it loaded — not
just the TTL. Any write between its load and its save is erased.

**Failure scenario** A page load (reads session, renders 80 ms) overlaps an
XHR `POST /cart/add`; the page's save runs last → cart item gone. With the
swap UI firing `data-load` regions in parallel this is the normal traffic
shape. (express-session defaults `resave: false` + `store.touch()` for
exactly this.)

**Fix** Split the intents: `dirty` → `set` as now; rolling-only → refresh
TTL without re-writing stale data — add optional `Store.touch?(key, ttlMs)`
(memoryStore implements it) with a `get`-then-`set` of the _current_ record
as the fallback. Re-issue the cookie in both branches.

### MEDIUM — the session-bound csrf token is not re-issued on the response that mints/rotates the session; `view.csrfToken` is stale on the same pages

**Location** `middlewares/csrf.ts:113-124`, `ui/represent.ts:42`
(`buildView` reads the _request_ cookie jar) · **Confidence** high (probe:
`add#1 → 200` mints the session, csrf not re-issued; `add#2` → `403
RAPID_CSRF_INVALID`).

**What** The binding is computed from the request's `sid` cookie and the
token is re-issued only on the _next_ response after a mismatch. The
response that mints/rotates/destroys the session still ships the old token;
the browser now holds `sid=new` + `csrf=bound(old)`. Same root cause on the
render side: `view.csrfToken` comes from `ctx.cookies`, so the no-JS form
recipe renders an empty (first visit) or old (post-login) hidden field.

**Failure scenario** Anonymous "add to cart" #1 succeeds, #2 → 403; the first
action after login (`regenerate()`) or logout (`destroy()`) → 403. Any
fetch-driven UI without an intervening GET hits it on every session
transition; the swap runtime renders it as an error fragment. The no-JS
PRG recipe (`prefer: 'html'` form routes) fails its first submit.

**Fix** `session()` records the outbound cookie value it just issued (or
`''` on destroy) on the ctx under a symbol; `csrf()`, after `await next()`,
re-issues the token on the same response when the binding changed, and
publishes the _effective_ token (e.g. `ctx.state.csrfToken`) which
`buildView` prefers over the cookie. State in both JSDocs that csrf must be
outer to session. (`ctx.responseHeaders.getSetCookie()` cannot be used —
`setCookie` queues privately until finalize.)

### MEDIUM — a concurrent second `stop()` tears down shared resources mid-drain and resolves early

**Location** `Application.ts:1700-1709, 1727` · **Confidence** high (probed).

**What** `stop()` flips `__started = false` synchronously, so a second
`stop()` arriving while the first is draining takes the "never started"
branch: it removes the owned uploads dir and disposes modules immediately
and resolves at once.

**Failure scenario** SIGTERM + SIGINT both bound to `app.stop()` (or Ctrl-C
twice): a request mid-multipart-parse → the uploads dir vanishes under it
(the exact bug the last review fixed for the single-call path); module pools
are disposed while drained requests still use them; the caller awaiting the
second `stop()` proceeds to `database.close()` before in-flight requests
finish.

**Fix** Memoise the in-progress teardown (`private __stopping?:
Promise<this>`; return it on re-entry; clear in `finally`). The idempotency
test at `Application.test.ts:116` covers sequential calls only — add a
concurrent one.

### MEDIUM — a middleware that calls `next()` without awaiting turns a later handler throw into a process-fatal unhandled rejection

**Location** `utils/compose.ts:73`; `transports/Transport.ts:275-289` cannot
see it · **Confidence** high (probe: response 204, `unhandledrejection`
count 1).

**What** `compose` hands the middleware `dispatch(i+1)`'s promise and nothing
else holds it. The contract (`types/Middleware.ts:19`) says "call `next()`
exactly once", not "await it", and `void next()` type-checks. If the
downstream handler rejects after the middleware returned, the chain already
resolved, `_invoke` finalised an empty 204, and the rejection is unowned —
Deno/Node terminate the process by default.

**Fix** In compose's `next` closure, side-guard: `const p = dispatch(i+1);
p.catch((e) => log…); return p;` (a side `.catch` does not stop `await
next()` callers receiving the rejection). Say "return/await `next()`" in the
`RapidMiddleware` JSDoc.

### MEDIUM — multipart has no per-request file-count cap; the total-bytes cap ignores whether uploads are enabled

**Location** `utils/parseBody.ts:140-179` (loop), `:219-221` (cap) ·
**Confidence** high (probe: 10k files written in ~1.0 s from one request).

**What** Every accepted `File` part becomes a `ulid()` + `writeFile` before
the handler runs; nothing bounds the number of parts, and the byte cap is
`max(maxBodySize, uploads.maxSize)` (10 MB default) regardless of
`allowedExtensions`.

**Failure scenario** (a) App allows `.png`; a ~10 MB body of ~50k parts,
each an 8-byte PNG header, is valid → ~5 s CPU and ~50k inodes per request,
eager and atomic so the handler cannot intervene. (b) Even with
`allowedExtensions: []`, `readCapped` buffers up to 10 MB per multipart
request before the first file part is rejected — 10× the JSON ceiling for an
app that never accepts uploads. (c) `uploads.maxSize` is documented per-file
but is also the request total: two 6 MB files under a 10 MB cap → 413.

**Fix** `uploads.maxFiles` (default ~20) checked before `arrayBuffer()`;
when `allowedExtensions` is empty cap multipart at `maxBodySize`; document the
real ceiling in `UploadOptions.ts` (or make it `maxFiles × maxSize`).

### MEDIUM — `mount.realRoot` is cached forever: a symlink-swap deploy 404s every static file until restart

**Location** `utils/staticFiles.ts:190-196` · **Confidence** high
(reproduced).

**What** The resolved root is computed once; the per-file `realPath` follows
the _new_ link target, so the containment check fails for every request
afterwards.

**Failure scenario** `static: { '/s': { root: '/srv/app/current/public' } }`
with the Capistrano-style `current → release-N` link: after `current` is
re-pointed, `/s/a.css` and `/s/` return 404, permanently.

**Fix** On a containment failure re-resolve `mount.realRoot` once and
re-check (cheap, failure path only); or don't cache — `realPath(root)` is one
syscall per request that already does two.

### MEDIUM — nested directory `index` never serves, contradicting the shipped `index` doc

**Location** `utils/staticFiles.ts:167-170` with
`transports/HTTPTransport.ts` (trailing-slash strip before the engine sees
`ctx.path`) · **Confidence** high (reproduced: `/s/` → 200 `index.html`;
`/s/docs/` and `/s/docs` → 404; `/s/docs/index.html` → 200).

**What** `StaticEntry.index` is documented "File served for a directory
request (path ends in `/`)", but `rel.endsWith('/')` is only ever true for
the mount root; any subdirectory resolves to a directory → not a file → 404.

**Fix** When `stat(real)` is a directory and `mount.index !== false`, retry
with `join(rel, mount.index)` (optionally 301 to the slash form); or narrow
the doc to "the mount root only".

### MEDIUM — `app.module(new X())` on a `RapidModule` subclass mounts routes but leaves `@On` silently inert and `this.log/emit/invoke` as latent 500s

**Location** `utils/mountModule.ts:416-434` ("A RapidModule handles those
through its runtime — skip quietly"), `Application.ts:1044-1049` ·
**Confidence** high (probed).

**What** The "skip quietly" branch assumes a runtime exists; on the
`app.module()` path there is none (`app.moduleRuntime === undefined`). The
neighbouring branch throws to prevent exactly this silent outcome for plain
`@Module` classes.

**Failure scenario** `Posts extends RapidModule` with `@GET('/posts')` and
`@On('posts:Posts:Made')`; `app.module(new Posts())` succeeds, `/posts` →
200, the subscription never fires; a route method calling `this.log.info()`
→ 500 `RAPID_CONFIG` on the first request.

**Fix** Export `_isAttached(instance)` beside `_attach/_detach`; in
`mountModule`, `if (isModule && !_isAttached(instance)) throw
RAPID_CONFIG('RapidModule instances mount through app.modules() /
initModules(), not app.module()')`.

### MEDIUM — `param(name)` without a validator is typed `string` but delivers arbitrary JSON on sockets and jobs

**Location** `decorators/binders.ts:34-44`, `utils/mountModule.ts:93-95` ·
**Confidence** high (probed on JOB; SOCKET uses the same
`ctx.args.params[name]` path).

**Failure scenario** `@JOB('j', …, { bind: [param('id')] }) run(id:
string)`; `triggerJob('j', { id: { $gt: '' } })` → the method receives the
object. On SOCKET a client frame does the same: `id.trim()` → TypeError 500,
or the object reaches a norm/Mongo filter as an operator (NoSQL injection
shape).

**Fix** In `extractBind`, for `source === 'param'` with no validator: if
`raw !== undefined && typeof raw !== 'string'` throw
`RAPID_VALIDATION_FAILED` ("param 'id' must be a string; pass a validator to
accept other shapes").

### MEDIUM — `dispose()` flips `__disposed` before draining, so cascaded emits/invokes during the drain fail

**Location** `modules/ModuleRuntime.ts:577-580` vs the `drain()` contract at
`:563` ("including ones they trigger") · **Confidence** high (probed:
`onB` never runs; log "ModuleRuntime is disposed — emit() is no longer
available").

**Fix** Two flags: `__disposing = true` (blocks `mount`/`finalize` only),
`await this.drain()`, then `__disposed = true` before unsubscribing and
running module `dispose()` hooks.

### MEDIUM — a namespace-exported module whose constructor requires arguments boots silently

**Location** `modules/initModules.ts:72-87` · **Confidence** high (probed:
`Reflect.construct(type, [])` succeeds — JS does not enforce arity — the
module mounts, `/needy` → 500 `RAPID_UNHANDLED`; the "could not be
constructed" message never fires).

**Fix** Before `registry.resolve(ctor)` on the unregistered path: `if
(ctor.length > 0) throw RAPID_CONFIG('… declares N constructor parameter(s)
— pass an instance via sources.instances or register it with doctor')`.

### MEDIUM — the history module builds `'#' + id` without `CSS.escape`; Back breaks or mis-targets for legal HTML ids

**Location** `ui/history.ts:101,142` · **Confidence** high.

**Failure scenario** `<section id="2024-q3" data-action=… data-push>`: the
push succeeds; Back → `querySelector('#2024-q3')` throws `SyntaxError`
inside the popstate handler → the URL changes, the content never restores,
the `location.assign` fallback is never reached. `id="a.b"` silently selects
`<… id="a" class="b">` — the wrong region is overwritten.

**Fix** `'#' + CSS.escape(region.id)`; wrap the `querySelector` in try/catch
falling back to `location.assign(entry.url)`.

### MEDIUM — the generated `AGENTS.md` (`--ai`, on by default) teaches wrong sibling-package APIs

**Location** `cli/templates.ts:409, 430-489` · **Confidence** high (each
checked in source; the file tells agents "do not guess", so it is
load-bearing).

- pact: `Pact.create({ bits, modules, apiKeys: true, hooks })` → the key is
  `modulePermissions`, no `apiKeys`; `issueApiKey(userId)` → `{ id, secret }`
  → real `issueApiKey({ userId })` → `{ key, secret }`; a `TOKEN` scheme.
- norm: `new Norm({ engine, secret })` → `{ database: { dialect, … }, secret
  }`; "Engines come from `@tundralibs/drivers` (e.g. `SQLiteEngine`)" →
  engines register via `@tundralibs/norm/engines/sqlite` (contradicts the
  scaffold's own `db.ts`).
- slogger: `formatter: 'standard'` → `SloggerFormatter` is a function type.
- crypt: `pbkdf2Hash`/`pbkdf2Verify`/`hkdf` listed under `/encrypt` → they
  live in `/digest` and `/generators`.
- `payload(UserSchema.parse)` advised → README and `binders.ts` say the
  schema OBJECT form documents the body; `.parse` is validate-only.
- workers variant: "`main.ts` passes the `configs/` directory" → the workers
  scaffold's `worker.ts` uses `Application.initialize({ name })`; the YAML
  is dead.

**Fix** Correct the six items (regenerate the pact block from the adapter
rewrite); for workers either omit `configs/` or say the YAML is unused.

### MEDIUM — README examples import sibling packages the reader was never told to install

**Location** `README.md:289,649` (`@tundralibs/doctor`), `:586`
(`@tundralibs/id`), install section `:25-41`; `docs/Rapid-Database.md`
(norm/drivers/doctor) · **Confidence** high.

**What** On Deno a transitive dependency is not a resolvable bare specifier;
the DI, `harness()` and `requestIdGenerator` examples fail to resolve for a
consumer following the README verbatim.

**Fix** One line per guide: "these examples also need `deno add
@tundralibs/doctor @tundralibs/id`" (pact / norm / drivers where used).

### MEDIUM — README overstates the scaffolded CI workflow

**Location** `README.md:712-713` vs `cli/templates.ts:536,552,569` ·
**Confidence** high. "runs fmt/lint/check/test on the chosen runtime" — only
Deno does; bun is `bun install` + `bun test`, node `npm ci` + `npm test`.
**Fix** "runs the runtime's test command (fmt/lint/check too on Deno)".

### MEDIUM — error-page negotiation is one-directional in a `prefer: 'html'` app

**Location** `ui/represent.ts:393-421` · **Confidence** medium (design
ambiguity; probed). For unmatched requests `wantsHtml = swap || prefer ===
'html' || (negotiated && …html)`: Accept can only _add_ HTML. `GET /nope`
with `Accept: application/json` in a pages-first app with `errorTemplates`
→ `404 text/html` with `Vary: rapid-swap, Accept`, although Rapid-UI.md
§Errors promises JSON clients keep the envelope and Accept did not decide.
**Fix** When `negotiated`, let Accept decide both ways; or reword the doc.

---

### LOW — assorted (verified, lower impact)

- **`server.requestIdHeader` is not boot-validated** (`Application.ts:1818`
  / `HTTPTransport.ts:477,482`): `""` or a name with a space boots clean,
  then every request throws a raw `TypeError: Invalid header name` from
  `handle()` outside the disclosure path. Validate with the `HEADER_NAME`
  regex `__configureUi` already uses.
- **`x-forwarded-host` trust rides on `trustProxy`, whose JSDoc mentions
  only XFF** (`utils/apiSurface.ts:124-145`, `ServerOptions.ts:59-68`).
  Behind a proxy that sets XFF but not X-Forwarded-Host (Cloudflare, stock
  nginx), a client on the api host can send `x-forwarded-host: www…` and get
  the ui surface (hidden pages, static, HTML errors). Document on
  `trustProxy`, or gate on an explicit `server.api.trustForwardedHost`.
- **`triggerJob()` bypasses cronus's overlap guard** (`JOBTransport.ts:
  128-145`): a manual firing runs concurrently with a scheduled one while
  the JSDoc/README advertise "per-job overlap prevention". Consult the
  running flag or document the bypass.
- **Signed cookies are not bound to the cookie name** (`utils/cookies.ts:
  30-31`): `name₁=v.sig` verifies verbatim as `name₂=v.sig`. Not exploitable
  in-package (session/csrf swaps fail downstream) but the classic primitive
  weakness under one shared secret. MAC over `${name}\0${value}` (rotate or
  dual-accept one release).
- **A signed empty value can never be read back** (`cookies.ts:44-45`):
  `signValue('')` → `.<hex>`; `verifySignedValue` rejects `dot <= 0`. Use
  `dot < 0`, or reject empty at `setCookie` when `signed`.
- **`allowedExtensions` is never normalised or boot-validated**
  (`parseBody.ts:153,159`): `png` / `.PNG` can never match → every upload is
  a 415 with no boot hint. Validate `/^\.[a-z0-9]+$/` in `__validate`.
- **`Range` honoured without `If-Range`** (`staticFiles.ts:234`): a client
  resuming after the file changed gets a 206 of the new bytes and stitches a
  corrupt file (RFC 7233 §3.2). Ignore `Range` when `If-Range` mismatches.
- **`session()` validates no TTLs** (`session.ts:118-119,251`): `idleTtl:
  500` (thinking seconds) → `maxAge: 0` = delete-cookie on every response —
  sessions last one request, silently. Factory-validate ≥ 1000 and
  `absoluteTtl >= idleTtl`; and the option names lack the `Ms` suffix every
  sibling uses (`ttlMs`, `pendingTtlMs`, `windowMs`).
- **Strong `ETag` reused across identity and gzip** (`etag.ts:35,53` +
  documented `compress(), etag()` order): RFC 9110 §8.8.3 requires a strong
  validator to change with `Content-Encoding`; nginx weakens for this reason.
  In `compress()`, prefix a present non-`W/` etag with `W/` when encoding.
- **BREACH exposure** (`compress.ts:49-53` + `represent.ts` embedding
  `view.csrfToken`): a static per-session token compressed alongside
  reflected input is the BREACH primitive. Per-response XOR mask, or skip
  compression when the view exposes the token.
- **Swap-redirect replies skip the personal-cache guard** (`represent.ts:
  227-250`): a `rapid-redirect` reply on an identity-bearing page goes out
  `200` with `Vary: rapid-swap` only — no `private`, no `Vary: Cookie`.
  Compute `personal` before the redirect branch.
- **`outer` swaps with multi-root markup wire only the first element**
  (`ui/ui.ts:71-83,241-242`): a second-root `data-load` never loads. Run
  `loadLazy` over each new sibling, or document one root per `outer`
  fragment.
- **`DefaultErrorPage` uses inline `style=` attributes** (`errorPage.ts:
  55-82`) — blocked under the documented strict-CSP recipe (nonces cannot
  cover style attributes). One sentence in the recipe, or a class +
  `<style>` in the core.
- **`ui.view` projection runs outside the render diagnostics**
  (`represent.ts:46`): a throw is a bare `RAPID_UNHANDLED` with no
  template-layer label. Wrap in `callChecked`.
- **`harness()` revokes, not restores, a caller-owned binding**
  (`testing/mod.ts:42,85-99,120-123`; doctor `Container.revoke` deletes):
  after `dispose()` a real `app.container.stock(Mailer, real)` is gone.
  Say "revoked (the previous local binding is not restored)", or snapshot
  and restock.
- **Constructor autobind trips the override check with a misleading
  message** (`mountModule.ts:456-469`): "Auto.find overrides a method
  decorated on Auto" and advice that cannot work. Detect
  `Object.hasOwn(instance, name)` and say "an own instance property shadows
  the decorated method (autobind?) — rapid binds `this`; remove it".
- **A `@Use` middleware that neither calls `next()` nor sets `ctx.response`
  yields a 204 success envelope** (`ModuleRuntime.ts:529`; the HTTP tier
  behaves the same). One JSDoc line: "set `ctx.response` to deny".
- **Project name is interpolated unescaped into YAML/JSON/TS**
  (`cli/commands/init.ts:57-62`): `rapid init "it's"` → syntax error in
  `main.ts`; `x: y` → YAML mapping. Validate `/^[a-z0-9][a-z0-9._-]*$/i`.
- **`--with` downloads with a pinned URL but no hash check** (`init.ts:
  159-161`); **`latestVersion('rapid') ?? '1.0.0'`** (`init.ts:172`) pins
  `^1.0.0` offline/unpublished while the first release will be 0.x; **the
  `modules` barrel emits duplicate `export { X }`** for two files exporting
  the same class name (`modules.ts:33-37`) — detect and name both files.
- **ROADMAP "Shipped" lists `permission`/`jwt` middleware that do not
  exist** (`ROADMAP.md:22`; `middlewares/mod.ts`), and "~80-line runtime"
  vs README "~200-line" (the string is 14 KB).
- **API-consistency nits:** caller-identity extractor spelled twice
  (idempotency `scope` → `string | undefined`, `''`/`undefined` skip, `false`
  opts out; rateLimit `key` → `string | null`, `null` exempts); factory-time
  validation uneven (`rateLimit`/`idempotency`/`timeout`/`memoryStore`
  throw, `session`/`compress({ threshold })`/`cors({ maxAge })` accept
  garbage); Rapid-UI.md:8,16-19 says `Accept` is "never consulted … no
  `Vary: Accept`" while :736-741 correctly describes the unmatched-404
  exception — soften the heading; "two functions are the runtime's whole
  public API" is true of `ui.js` only (`live.js`/`history.js` add
  `rapid.live.*`/`rapid.history.push`); README:693 "the runtime is asked
  first" — the project name is (runtime is the first _option_).

---

## Attacked, could not break

- **XSS:** escaper table (`& < > " '`) verified; nested `Html`, arrays,
  `null/false/0/''`; `DefaultErrorPage` escapes `message`/`code`/`requestId`/
  `details`/`JSON.stringify(debug)`; `htmlDocument` escapes `lang`, `<title>`,
  meta keys/values, `canonical`; PRODUCTION collapses `RAPID_TEMPLATE_RENDER`
  / `RAPID_UNHANDLED` in the HTML page; `Html` brand is symbol-keyed
  (unforgeable from JSON); `rapid-title` percent-encoded server-side and
  decoded into a text sink.
- **Client runtime:** `rapid-redirect` follow and the primary fetch are
  origin-gated (`//h`, `\\h`, `javascript:`, `data:`, `https://origin@evil`,
  mixed-case hosts all refused; malformed ignored); CRLF in a handler
  redirect → `Headers.set` TypeError → 500, not injection; swapped bodies go
  through `innerHTML`/`outerHTML`/`insertAdjacentHTML` (scripts inert, as
  documented); non-HTML / non-2xx bodies never land in the DOM; `live.ts`
  puts push payloads only in `CustomEvent.detail`; no inline handlers, no
  `eval`; history `pushState` wrapped, cross-origin/`javascript:` pushes
  swallowed, popstate handles only `__rapidHistory` entries; `data-load`
  GET-only, once per element, same-origin.
- **Surfaces:** hidden-page oracles closed on HEAD (`{...entry}` inherits
  `template`/`uiOnly`), `Allow` (re-filtered per method), metrics identity
  and span name (`<unmatched>` via `ctx.matched`), logs (raw path both
  cases), route middleware (chain chosen after clearing), `server.static`
  (ui-only), `representError` (bails on `api`). Prefix strip cannot reach an
  otherwise-unmatched route (`new URL` collapses dot-segments first; encoded
  slashes stay encoded; radrouter sees one string). `//admin/secret` and
  `/admin//secret` → 404 (empty segments not collapsed). `prefer` resolution
  is consistent across the transport's `__hiddenOnApi`, `represent`,
  `representError` and `openapi` (route → `app.uiPrefer`, configured value
  even when `enabled: false`).
- **Static traversal:** `%2e%2e/`, `..%2f`, `%c0%ae` overlong, `%00`,
  `%5c`, doubled — all 404; lexical `join` + prefix check and `realPath`
  containment held. **Range:** `-1e20` suffix → full 206; `1e20-`, `5-2`,
  `-0` → 416; multi-range → 200; 40-digit end clamps. **HEAD with a
  stream:** 200, real `content-length`, empty body, stream cancelled.
- **Cookies / signatures:** value with `; Path=` + CRLF percent-encoded;
  illegal name → 500 never a split header; bit-flip / append / wrong length /
  non-hex → `undefined`; `crypto.subtle.verify` constant-time. **csrf
  math:** `lastIndexOf('.')` vs first `.` split unambiguous (hex + ULID);
  forged/absent `sid` rejected; comparisons on HMAC-derived values.
- **Sessions:** `regenerate()` evicts the old id even when followed by
  `destroy()`; save runs on the throw path; `loaded` gates a half-failed load;
  absolute cap survives rolling; clone at load and save.
- **Stores:** all three stateful middlewares fail CLOSED on a rejecting
  store; `memoryStore` bound + `evictable` real; idempotency `release()` is
  the one swallowing path and is correct. **rateLimit:** `trustProxy: 0`
  default means XFF cannot fork buckets. **CORS:** `Vary: Origin` appended
  on every origin-bearing request; credentialed `*` reflects by design and
  loudly documented. **compress:** 204/205/304/206/`content-range`/already-
  encoded skipped; `Vary` merged; `q=0` regex correct. **timeout:** the
  abandoned chain's later writes throw `RAPID_RESPONSE_INVALID` inside the
  detached promise, pre-absorbed by `detach()`.
- **Body / query:** cap enforced on bytes read (chunked-safe); partial
  multipart rejections delete written files; finalize's error path runs
  cleanup; only the allowlisted extension + a ULID reach disk; 200k
  duplicate params in 26 ms; 200k distinct keys hit the 50-filter cap
  immediately; paging `1e309`/`0x10`/`-5`/`NaN`/`Infinity` fall to defaults;
  SSE `\r`/`\n` stripped.
- **Modules / DI:** prefix `/api/` + `/x` collapses in radrouter; `prefix:
  '/..'` is a dead literal route, not traversal; no `Object.assign` on the
  payload path (spreads use CreateDataProperty → `__proto__` becomes an own
  key); `asValidationError` needs a thrown `Error` instance exposing
  `leafErrors` — unreachable from JSON; two apps in one process get distinct
  containers and distinct SINGLETON module instances; decorator metadata is
  per-class and immutable; a throwing subscriber is isolated; reverse-order
  dispose continues past a throwing hook.
- **Lifecycle:** double `respond()` routed through `__errorResponse`;
  `route()/use()` throw after first `fetch()`; `job()/socket()` close at
  `start()`; `__configureUi` after start throws; exit backstop armed at 1.1×
  and cleared; `requestIdGenerator` setter blind-calls and regex-checks.
- **Runtime hygiene / publish:** no `Deno.`/`Bun.`/`process.`/`node:`/
  `globalThis` sniffing outside compat in non-test source; temp dir creation
  gated on `!isWorkers && !isBrowser`; `assetVersion`'s sync fs in
  try/catch; root `publish.exclude` covers `DESIGN*.md`, `REVIEW*.md`,
  `ROADMAP.md`, `tsconfig.json`, tests, benches, `examples/**`; `deno publish
  --dry-run --no-check` clean (no slow-type / private-type-ref); every `ts`
  block in README and Rapid-UI.md type-checks; `dashboard`, `htmx`, `kanban`
  boot; `blog` fails only on pact.
- **Docs that held (so the fixes above are the whole list):** the entire
  Surfaces section sentence by sentence; the UI DATA/CODE key sets; all
  README numerics (`name` ≤ 30, `secret` ≥ 32, `shutdownTimeout` 25 000 /
  ×1.1 / 0 disables, 255-char idempotency keys, csrf/session defaults,
  `openapi` `expose`); all ten binders and `config()` semantics; the ~30
  documented client-runtime behaviours; every CLI flag and default; the
  Rapid-Database pool numbers.

## What's already solid

The surface resolver is ordered right (prefix → version → route) and
normalises hostnames through `URL`; "a hidden page is a true no-match chosen
before the chain" is the correct shape and is pinned by tests. The
escaper / brand / `raw()` trio is minimal and audit-friendly. The sync
fast path (zero-middleware `compose` returns `next` directly; a `null`
return never reaches `.then`), `__finalize`'s sync-through-unless-signing,
the parse-once payload promise, the strict call-order cookie queue, the
`readCapped` "count what you actually read" cap, wire-faithful idempotency
snapshots, the `claim`/`hitWindow` race-free seam on the default store, the
holder pattern for detached `next()` in the module runtime, name-keyed
decorator metadata, and the fail-loud tripwires (legacy decorators, missing
`Symbol.metadata`, `@Use` near a transport decorator, override without
redecoration, closed config key sets, boolean gates, the `server.api`
grammar) are all exactly right and explained in place. The YAML drift test
is the model for the scaffold fixes: generate, then check.
