# rAPId full-pass review (2026-08-23)

Six-lens audit (extract-to-utils · simplify · missing/parity · bug · security ·
perf) across all ~12.5k lines of source, run as five parallel area reviews and
then **verified against source by the lead** before landing here. Every item
below is confirmed unless tagged `[UNVERIFIED]`. Two items are regressions from
_this session's_ OpenAPI work and are marked `⟲`.

**STATUS 2026-08-23:** all IN-PACKAGE items (Tiers 1-4) are FIXED and green
(Deno 83/557, Bun 541, Node 541), each with a regression test. The Tier-5
EXTRACTIONS remain open — each is a separate cross-package release (utils/compat
minor → then rapid consumes), tracked below. `#22` (ModuleRuntime invoke/
subscriber dispatch dedup) was DEFERRED: a pure-cosmetic refactor of the hot
invoke path, not worth the regression risk right now — noted, not done.

Legend: **H/M/L** severity · category in brackets · `file:line`.

---

## Tier 1 — security & correctness (do first, in-package)

1. **H [security] `@Use` guards are silently inert on the HTTP/SOCKET/JOB path.**
   `utils/mountModule.ts:230` (`buildInvoker`) calls `fn.apply(instance, args)`
   directly and never consults `middlewareOf`; only `ModuleRuntime.invoke()`
   (in-process, `ModuleRuntime.ts:301`) runs `@Use`. So
   `@GET('/admin') @Use(requireAdmin) purge()` serves external requests with NO
   guard, while a trusted module-to-module `invoke()` runs it WITH the guard —
   the untrusted caller is the one that skips it. `@Use`'s own doc actively
   invites the mistake: _"Guards belong here (`@Use(requireRole('admin'))`)…
   `@Use` is request-boundary policy."_ The behaviour is arguably by-design
   (`use.ts`: "runs ONLY through invoke"), so the **fix is to make the silent
   inertness LOUD**: at mount, reject `RAPID_CONFIG` when `@Use` co-decorates a
   route/socket/job method (mirrors the existing `@Use`-on-`@On` rejection at
   `ModuleRuntime.ts:306`), and correct the `@Use` doc to say it does not guard
   transport requests (those use route-scoped middleware / `guardHTTP`).

2. **H [bug] Override-without-re-decorate drops the `@Use` guard / `@On`
   subscription in the invoke tier.** `ModuleRuntime.ts:277-329` walks
   prototypes most-derived-first with a `seen` set and reads `middlewareOf` at
   the same level as the function; a subclass that overrides a decorated method
   WITHOUT re-decorating registers it with `chain: undefined` and the
   ancestor's `@Use`/`@On` is skipped via `seen`. `invoke(Sub,'doThing')` then
   runs unguarded; an overridden `@On` is dropped from subscriptions _and_
   becomes an invokable method. The route tier (`mountModule.ts:392-409`)
   already rejects this exact case loudly — the invoke tier is missing the
   symmetric check. Fix: mirror `mountModule`'s resolution + `RAPID_CONFIG`.

3. **M [security] `login()` echoes the entire pact principal to the client.**
   `endpoints/login.ts:49` returns `{ token, principal }` where `principal` is
   `{ id } & Record<string, unknown>`. A `password` strategy that returns the
   user row leaks `passwordHash` / `mfaSecret` / internal roles on every
   successful login. Fix: return a minimal `{ id }` by default, or make the
   disclosed shape an explicit option; at minimum document the echo.

4. **M [bug] reply-cookie failures and respond() failures escape the disclosure
   envelope / drop headers.** Cluster with one root — `_applyReplyCookies()`
   runs in `HTTPTransport.__finalize` _before and outside_ the error handling,
   and `finish()` itself is called OUTSIDE `disclose()`'s try in
   `Transport._invoke` (`Transport.ts:235,260`, verified):
   - a reply `{ cookies:[{ name:'bad key' }] }` (illegal name) throws out of
     `__finalize` → raw 500, no requestId echo, no theming (signed variant →
     unhandled rejection). A direct `ctx.setCookie('bad key',…)` inside the
     handler throws _inside_ the onion and discloses cleanly.
   - the `respond()`-failure branch (`HTTPTransport.ts:534`) hand-builds a
     `Response` with only content-type + request-id, discarding every
     accumulated header — including a just-queued signed-session `Set-Cookie`.
     Fix: run `_applyReplyCookies()` inside the disclosure try (or inside
     `__materialize`'s try) and seed the error `Response` from
     `ctx.responseHeaders`.

5. **M [bug] `compress()` buffered path leaves a stale `content-length`.**
   `middlewares/compress.ts:151-160`: when a compressible body ≥ threshold
   carries an explicit `content-length`, the buffered branch swaps in the
   smaller gzip bytes but never updates/drops the length (the streaming branch
   does — `deleteHeader('content-length')` at :144). Client sees
   `content-encoding: gzip` + too-large length → hang/truncation. Fix: set
   `content-length: String(compressed.length)` (or delete it) in the buffered
   branch.

6. **M [bug] `serveStatic` prefix matches on raw `startsWith`.**
   `middlewares/serveStatic.ts:128`: `prefix:'/static'` makes `/staticfoo/x`
   match and serve `root/foo/x`, shadowing unrelated routes. (Stays in `root`,
   so not a traversal escape.) Fix: `pathname === prefix ||
   pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')`.

7. **M [bug] `serve(path, { download })` 500s on a non-ASCII filename.**
   `context/HTTPContext.ts:359` emits `filename="<raw>"`; a name with a code
   point > U+00FF makes `Headers.set('content-disposition', …)` throw
   `TypeError: not a valid ByteString` (verified empirically on Deno) → a
   download becomes a disclosure-path 500. A trailing `\` also produces a
   malformed quoted-string. Fix: emit an ASCII-sanitized `filename="…"` **and**
   RFC 5987 `filename*=UTF-8''<encodeURIComponent(raw)>`.

8. **M [bug/parity] `csrf()` and `session()` throw on their own documented
   usage.** `middlewares/csrf.ts:58` / `session.ts:106` take a REQUIRED
   `options` (no `= {}`), yet every field is optional and the docstrings show
   `app.use(csrf())` / `app.use(session())` (in `ts ignore` blocks, so
   `--doc-only` never caught it). At runtime the arg-less call throws
   `TypeError` reading `options.cookie`/`.store`; at compile it's a TS
   missing-arg error. Every sibling factory (`cors`/`rateLimit`/`compress`/
   `healthCheck`/`requestId`) uses `= {}`. Fix: `= {}`.

9. **M [bug] post-start `channel()` is a silent no-op when the app started with
   no channels and no socket commands.** `Application.ts:576` →
   `HTTPTransport.ts:331` `this.__rpc?.channel(...)`; the rpc/ws server is only
   built when `socketCommands.length>0 || channels.size>0`
   (`HTTPTransport.ts:178`). So `await app.start()` (zero of each) then
   `app.channel('news')` registers into the map, no-ops on rpc, mounts no
   upgrade endpoint — clients can never subscribe, no error. The code comment
   says it should work. Fix: reject post-start `channel()` when no listener was
   mounted, or mount one.

---

## Tier 2 — missing / parity (in-package)

10. ⟲ **M [bug] OpenAPI top-level `tags`/`x-tagGroups` are keyed by
    `module.name`, but operations are tagged with `meta.tags`** (which a
    `@Module({tags})` or `@GET({tags})` overrides). `buildOpenApi.ts:110-119`.
    A namespaced module with a custom tag emits operations tagged
    `'User Management'` while the top-level catalog + group list only `'Users'`
    — and since `x-tagGroups` is present, Redoc/Scalar HIDE any tag not in a
    group, so the custom tag vanishes and an empty `'Users'` group shows. Fix:
    build the catalog + "Other" bucket from the union of actual operation tags.
    _(Regression from this session's OpenAPI commit.)_

11. ⟲ **M [missing] Response schema ignores the `toJSONSchema` fallback the
    request body honors.** `buildOpenApi.ts:108` uses `response?.toOpenAPI?.()
    ?? {type:'object'}`; the body (`:106`) also tries `toJSONSchema?.()`. And
    `types/RouteOpenApi.ts` narrows `response` to `{ toOpenAPI? }`, dropping the
    `toJSONSchema` the decorator captured. A JSON-Schema-only emitter documents
    the body but yields a bare object for the 200. Fix: add the fallback +
    widen the type. _(Regression from this session.)_

12. **M [missing] `@Use`/`@On` on a plain (non-`RapidModule`) class are silently
    inert.** `ModuleRuntime.mount` only accepts `RapidModule`
    (`ModuleRuntime.ts:210`) and `mountModule` skips `@Use`/`@On`-only names —
    so `@Use(guard)` on a plain `@Module` route method does nothing, no warning.
    Fix: warn/reject at mount.

13. **L [missing] `healthCheck()` answers only `GET`.** `healthCheck.ts:40`;
    many probes use `HEAD` (and `serveStatic` already accepts both). Fix: allow
    GET+HEAD.

14. **L [missing] reply `cookies` are the only response key a bare `ctx.respond()`
    drops** — they need the out-of-band `_applyReplyCookies()` call, whereas
    `redirect`/`headers`/direct `setCookie` all survive `respond()` alone
    (`HTTPContext.ts:478`). Belongs with #4's fix (fold into the `respond()`
    template) or document `_applyReplyCookies` as a mandatory pre-respond step.

---

## Tier 3 — perf (in-package)

15. **M [perf] per-request OTel attributes object allocated even with no
    tracer.** `HTTPTransport.ts:487` builds `{ 'http.request.method',
    'http.route' }` unconditionally though `_invoke` only reads it when a tracer
    is set (`parent` right above is correctly guarded). Fix: guard on
    `this._app.tracer !== undefined`.

16. **M [perf] `buildInvoker` allocates `binds.map(...)` + `Promise.all([])`
    per request even for zero-bind routes.** `mountModule.ts:227`. A
    `@GET('/health')` pays an array + a microtask for zero args. Fix: empty-binds
    fast path at mount; longer-term, keep the sync-source path sync
    (`extractBind` is `async` even for `param`/`query`/`auth`/`config` w/o a
    validator).

17. **M [perf] upload responses block on temp-file cleanup.**
    `HTTPTransport.ts:554` returns `cleanup().then(()=>response)`, so the client
    waits for `unlink()`s — contradicting the method's own "never blocking it"
    comment. Fix: `ctx.detach(ctx.cleanup())` and return immediately (uploads
    only run on Deno/Bun/Node), or correct the comment if blocking is intended.

18. **L [perf] multipart uploads buffer ~3× in memory** (`parseBody.ts`:
    `readCapped` → `Response(bytes).formData()` → per-file `arrayBuffer()`).
    Largely inherent to the cross-runtime Fetch `FormData` API; noted as the
    biggest per-request memory cost. A true fix is a streaming multipart parser
    (large; defer).

19. **L [perf] micro-waste cluster** (each small, batchable): `new TextDecoder()`
    per JSON/text request (`parseBody.ts:244` — mirror the module-level encoder
    pattern); `ctx.method` recomputes `trim().toUpperCase()` each read
    (`HTTPContext.ts:147`); `new URL(ctx.url)` per request in `healthCheck`/
    `serveStatic` before routing; `serveStatic` opens a file stream for `HEAD`
    then cancels it; `cors`/`response` getters clone `Headers` on every read.

---

## Tier 4 — simplify (accumulated edit cruft)

20. **M [simplify] `Application.stop()` reinvents compat.** `Application.ts:1088`
    uses raw `globalThis.Deno?.exit` / `process.exit` / `Deno?.unrefTimer` —
    `@tundralibs/compat/runtime` exports `exit()` and `unrefTimer()` (verified)
    and the file already imports from that module. Golden-rule violation. Fix:
    import and use them.

21. **M [simplify] JOBContext/SOCKETContext `response` setter+getter are
    near-identical** (`JOBContext.ts:96-126`, `SOCKETContext.ts:161-191`; the
    getters are byte-identical) — reject-3xx, reject-stream, super.response,
    null→200, status→_status, differing only in the error label. Fix: a shared
    `_setEnvelopeResponse(response, label)` / `_envelopeResponse()` on `Context`
    (or an `EnvelopeContext` base for the two non-HTTP transports). ~40 lines.

22. **M [simplify] `ModuleRuntime` invoke vs subscriber dispatch blocks are
    near-duplicated** (`ModuleRuntime.ts:474-495` vs `605-621`) — same
    holder/`dispatch`/`isThenable`/settle wiring. Extractable without touching
    the sync-through fast path.

23. **L [simplify] `serveStatic` class JSDoc is stale and false** — says "reads
    whole files into memory and does no Range handling" while the code streams
    (`:214`) and fully implements Range (`:192-211`). Ships in the tarball
    (docs-are-shipped rule). Fix: delete those two sentences.

24. **L [simplify] `buildOpenApi` edit-artifacts**: dead `?? tagDocs.get(name)`
    (`:112-114`, unreachable under its guard); `bodySchema` computed for
    bodyless routes then dropped (`:106`); the awkward get-or-create at `:116`.
    Also `x-versions` is sorted lexicographically (`:202`) → `v1, v10, v2`
    (natural sort wanted). The mountModule/hasDecorations prototype-walk appears
    3× (mountModule ×2 + ModuleRuntime) — a shared `forEachDecoratedMethod`.

---

## Tier 5 — extract to a lower package (each is its own cross-package PR;

one-package-per-PR → branch off `main`, PR, release, then rapid consumes)

Strongest first. The precedent is `readFileStream` → compat.

- **H → `@tundralibs/utils`: `resolveClientAddress`** (`utils/resolveClientAddress.ts`).
  Security-critical XFF hop-count resolution; already depends only on utils'
  own `isPublicIP` — the exact sibling of the IP helpers utils ships. Zero
  cross-package friction. (Also fix the `:port`-in-XFF collapse while moving —
  a fail-closed nit today.)
- **H → `@tundralibs/compat/http` (or utils): `negotiate`** (`utils/negotiate.ts`).
  Pure Accept q-value/wildcard negotiation, no rapid imports; restler/radrouter
  want it.
- **M → `@tundralibs/compat/http`: `parseRange`** (`serveStatic.ts:33`) — RFC
  7233 byte-range parser, the missing companion to compat's new `readFileStream`
  byte-ranges.
- **M → `@tundralibs/compat/http`: cookie `parseCookies`/`serializeCookie`**
  (`utils/cookies.ts`) — RFC 6265 encode/decode (only a `RapidError` to swap
  out). `signValue`/`verifySignedValue` can ride along or stay.
- **M → `@tundralibs/utils`: `compose`** (`utils/compose.ts`) — the Koa-style
  onion; `ModuleRuntime.ts:110` reimplements the same algorithm. Extract a
  plain-error version; rapid keeps a thin `RapidError` wrapper; both copies
  share it.
- **M → `@tundralibs/compat` (new stream subpath): `toReadableStream` +
  `sseStream`/`frameSseEvent`** (`utils/streams.ts`) — transport-agnostic,
  neighbours compat's webserver/websocket.
- **M → `@tundralibs/utils`: the TC39 decorator-metadata side-table**
  (`decorators/registry.ts:41-131`) — `Symbol.metadata` polyfill + own-vs-
  inherited metadata discrimination + `Object.hasOwn` bucketing. Proactive
  (single consumer today), like the file-stream precedent.
- **M → `@tundralibs/ambient`: `hiddenSlot(symbol)`** — the non-enumerable
  pin-on-the-ambient-bag pattern is duplicated verbatim in
  `utils/requestContainer.ts:28` and `ModuleRuntime.ts:643`; the "non-enumerable
  so the logger spread never copies it" knowledge belongs where that spread
  lives.
- **L → `@tundralibs/compat/file`: `mimeTypeFor`** (fold next to the file
  helpers so `serve()`/any static server share one resolver).
- **L → `@tundralibs/compat/http` (with `negotiate`): `pickEncoding`**
  (`compress.ts:41`) — Accept-Encoding negotiation.
- **L → `@tundralibs/utils`: `isThenable`** (inlined ~5× across the invoke
  spine + ModuleRuntime); **`safeClone`** (`buildState.ts` CLONE mode, with its
  `__proto__`-safety); **`escapeRegExp`** (`resolveVersion.ts:19`).
- **L → `@tundralibs/utils` `Events`: a `listenerCount(event)`** — deletes
  `RapidEvents.__counts` (`events.ts:56`), a parallel map kept only because
  utils `Events` doesn't expose its own count.

---

## Suggested sequencing

1. **In-package fix batch A (security/bugs, Tier 1 #1-9 + #10-11 regressions):**
   one branch, each with a failing-first test. Highest value, no cross-package
   dependency.
2. **In-package fix batch B (perf #15-17, simplify #20-24, missing #12-14):**
   mechanical, low-risk.
3. **Extractions (Tier 5), one at a time, highest-value first**
   (`resolveClientAddress`, `negotiate`, `parseRange`) — each a
   utils/compat minor released before rapid consumes it, per the one-package
   rule. The rest as appetite allows.

Not started — awaiting direction on which batch to take first.
