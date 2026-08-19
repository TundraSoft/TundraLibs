# rAPId phase B/C/D — adversarial review round 2 (2026-08-14)

Three independent adversarial reviewers (decorator tier; middleware
engine; context/args/parsers), each told what is deliberately deferred
so they hunted defects, not designed gaps. Every finding below was
RE-VERIFIED by the author by running it — `[✓exec]` means reproduced on
this machine, with the runtimes noted where behaviour diverges.
Reviewer claims that did not survive verification are recorded at the
bottom so they are not re-litigated.

## HIGH

- [x] **FIXED 2026-08-14** (null-prototype accumulator +
      `Object.hasOwn` cap check; regression tests pin the shape, the
      no-silent-drop guarantee, and that dangerous keys now COUNT
      against `maxFilters`; verified identical on Deno/Node/Bun).
      **H1 — `parseQueryFilters` corrupts its own output on a
      `__proto__` query key; corruption DIFFERS BY RUNTIME.** `[✓exec
      Deno+Node]` `utils/parseQueryFilters.ts:178,213,219`.
      `?__proto__=eq:x` on **Node**: the filters object's prototype is
      SWAPPED and the filter silently vanishes (`Object.keys` → `[]`) —
      a silent drop, which the parser's design explicitly forbids. On
      **Deno**: an own key literally named `__proto__` survives into
      the untrusted carrier, a ready-made pollution gadget for any
      consumer that later copies filters by assignment. `constructor`
      likewise lands as an own key shadowing `filters.constructor` on
      both. Minor rider: `key in filters` is prototype-aware, so these
      two keys skip the `maxFilters` cap check (bypass of at most two
      slots — nuisance, not DoS).
      FIX: build `filters` with `Object.create(null)` and use
      `Object.hasOwn(filters, key)` for the dup/cap check.
- [x] **FIXED 2026-08-14** (null-prototype accumulator — which also
      fixes the `append()` inherited-read branch; verified on all three
      runtimes).
      **H2 — `parseBody` has the identical hole via FORM FIELD NAMES.**
      `[✓exec Deno]` `utils/parseBody.ts:115,117-128`. A urlencoded or
      multipart field named `__proto__` corrupts the parsed body object
      the same way (own key on Deno; on Node the `append()` helper
      reads the inherited value first and stores `[Object.prototype,
      value]`, swapping the prototype to an array). Reachable through
      the request BODY — the more common pollution entry point.
      FIX: same shape — null-prototype accumulator + `Object.hasOwn`.
- [x] **FIXED 2026-08-14 — WARNING DELETED** (user decision: a warning
      that lies in the common case, and that pushes `guard*` → `only*`
      i.e. safe → unsafe, is worse than none). `Application.start()`
      keeps a comment recording why it must not come back as a
      heuristic; a test pins that boot emits no scope warning. Real
      coverage checking is deferred to the AUTH-CONTEXT design round,
      where the framework will know which middleware is
      security-relevant.
      **H3 — the socket-auth boot warning is defeated by any unscoped
      middleware — i.e. by the normal setup.** `[✓exec]`
      `Application.ts:429-440` + `middlewares/scope.ts:43-48`.
      `app.use(onlyHTTP(auth))` with socket commands correctly warns.
      Add `requestLogger()` — or any shipped universal middleware — and
      the warning goes SILENT while the auth hole is unchanged: the
      check asks only "does some middleware reach SOCKET", and an
      unscoped logger answers yes. Worse in the other direction:
      `guardHTTP(auth)` (which fails CLOSED — sockets are rejected)
      triggers the scary "every command runs unguarded" message, so the
      obvious way to silence it is to downgrade `guard`→`only`, which
      actually opens the hole.
      ROOT CAUSE: `MIDDLEWARE_SCOPE` records WHICH transports but not
      the DISPOSITION (skip vs fail-closed), and logging/timing
      middleware are counted as if they satisfied an auth requirement.
      FIX: record disposition in the metadata and stop treating
      unscoped middleware as socket-guarding; or drop the warning
      rather than ship one that lies in the common case.

## MEDIUM

- [x] **FIXED 2026-08-14** — hold-the-slot (chosen over skip-jobs and
      docs-only). `Context.detach(work)` + `settleDetached()` is the
      new seam: `timeout()` hands its abandoned promise to the context
      when the deadline wins, and JOBTransport's SCHEDULED path awaits
      it AFTER reporting the outcome, so the 504 is still prompt but
      cronus's slot stays held until the work settles — a truly wedged
      handler degrades to the safe pre-timeout behaviour instead of
      accumulating. Trigger path does not hold (no slot at stake).
      FIXED IN RAPID, NOT CRONUS, deliberately: cronus's contract
      ("the action promise IS the run") is correct and it cannot know
      that a resolved promise still has work behind it — rapid was the
      one resolving early. Docblocks corrected (they claimed the
      opposite) with the prior-art note that schedulers which really
      kill overruns do it at a process boundary we lack.
      **M1 — `timeout()` on jobs DEFEATS cronus's overlap guard, and
      the code comment claims the opposite.** `[✓insp, traced]`
      `middlewares/timeout.ts:21-25` vs `transports/JOBTransport.ts` +
      cronus. `_invoke` catches the timeout rejection and RESOLVES at
      the deadline, so cronus clears `running` then — while the wedged
      handler continues detached. A job scheduled every minute with
      `timeout(30s)` therefore spawns a NEW detached hung handler every
      minute, unbounded. Without the timeout, cronus's guard keeps one
      wedge and skips ticks. The middleware's own docblock cites the
      overlap guard as the reason background continuation is safe here.
      FIX: correct the comment, and either exclude jobs from `timeout`
      by default or hold the job "running" until the detached work
      settles.
- [x] **FIXED 2026-08-14** (user chose extending rpc over accepting the
      loss). TWO packages: (1) **rpc** — `ResultFrame`'s error variant
      gains an OPTIONAL `data?: unknown`; the server forwards `data`
      off a thrown error alongside `code`; the client attaches `.code`
      and `.data` to the rejection (message format unchanged). Purely
      additive — a thrown error without `data` still produces a
      byte-identical frame (test-pinned). (2) **rapid** —
      `utils/socketOutcome.ts` derives the envelope: framework
      disclosure payloads pass through verbatim; handler-authored
      errors get a STATUS-DERIVED code and keep their content as
      `data`. Unmapped statuses fall back BY CLASS (4xx →
      RAPID_VALIDATION_FAILED, 5xx → RAPID_UNHANDLED) — found while
      testing: 422 has no registry mapping and was still laundering to
      RAPID_UNHANDLED, i.e. reporting a client error as a server bug.
      Verified end-to-end on Deno/Bun/Node: the same handler now
      returns `{fields}` with a client-error code over BOTH transports.
      NOTE: this rpc change needs its own commit/PR/release.
      **M2 — the socket transport flattens handler-authored 4xx/5xx
      into a generic error.** `[✓insp]` `transports/HTTPTransport.ts:
      157-171`. Any `status >= 400` outcome is assumed to be the
      framework disclosure envelope `{code, message}`; a handler
      returning `{ status: 422, content: { fields } }` loses its body
      entirely on sockets (client sees `RAPID_UNHANDLED` / "Internal
      server error") while the SAME handler on HTTP returns the full
      422. Cross-transport data loss.
- [x] **FIXED 2026-08-14** (alongside M2 — the same dispatch site):
      `ctx.respond()` on the socket path is now wrapped, logging and
      producing a uniform disclosure envelope exactly like HTTP
      `__finalize` and JOB `__run`.
      **M3 — the socket path's `ctx.respond()` is unguarded**, unlike
      HTTP `__finalize` and JOB `__run` which both wrap it. `[✓insp]`
      `transports/HTTPTransport.ts:157`. An early `respond()` on a
      socket frame escapes uncaught into rpc instead of becoming a
      uniform disclosure outcome — the one transport that skips the
      hardening we added everywhere else.
- [x] **FIXED 2026-08-14** — the `!Array.isArray(content)` guard the
      `args` path already had; an array reply is now left untouched
      (there is nowhere to put an id in an array). Test pinned.
      **M4 — `requestId({socketEcho:true})` destroys ARRAY replies.**
      `[✓exec Deno+Node]` `middlewares/requestId.ts:45-59`. An array is
      `typeof 'object'`, is not `Uint8Array`, and `'requestId' in
      [1,2,3]` is false — so it passes the guard and gets spread:
      `[1,2,3]` → `{"0":1,"1":2,"2":3,requestId}`. The `args` path
      correctly excludes arrays; this one forgot the same check.
- [x] **FIXED 2026-08-14** — the full null-body status set
      ({101,103,204,205} + 304) now drops the body instead of throwing,
      so an explicit 205 is honoured rather than becoming a 500.
      **M5 — `serializeResponse` throws on status 205 (and 101/103)
      with non-null content.** `[✓exec]` `utils/serializeResponse.ts:
      52-56` special-cases only 204/304. A handler setting `{status:
      205, content: {...}}` gets a 500 (the finalize guard catches the
      throw) instead of the intended empty 205.
- [x] **FIXED 2026-08-14** — every decorator factory is now an OVERLOAD
      PAIR: the no-`bind` form pins `A` to `[]`, so a decorated method
      that declares parameters without binds is a compile error at the
      `@` site. Applied to all five verbs plus `@SOCKET`/`@JOB`. Pinned
      by a `@ts-expect-error` test (which would itself error if the
      check regressed).
      **M6 — `@GET(...)` with NO `bind` silently disables ALL parameter
      checking.** `[✓exec]` `decorators/http.ts` (+socket/job). With
      `bind` present the tuple correctly drives parameter types; with
      `bind` OMITTED (or `{}`), `A` is inferred from the method's own
      signature instead of being pinned to `[]`, so
      `@GET('/users/:id:') find(id: string, extra: number)` compiles
      CLEAN and records zero binders — every declared parameter will be
      `undefined` at mount. Exactly the mistake a newcomer makes.
      (Control: `bind: []` explicitly DOES error.)
      FIX: overload the factories so the no-`bind` form requires a
      zero-parameter method.
- [x] **FIXED 2026-08-14** — `cleanup()` awaits the cached parse
      promise (catching) before deleting, so files written by a
      started-but-unawaited parse are tracked and removed; and each
      delete is individually guarded so one failure no longer strands
      the rest (that was L9, fixed alongside). Test drives the exact
      shape: start the parse, do NOT await, clean up, assert no temp
      file survives.
      **M7 — `HTTPContext.cleanup()` doesn't await an in-flight payload
      parse → orphaned upload temp files.** `[✓insp]`
      `context/HTTPContext.ts:154-164,241-247`. If a handler starts
      `ctx.payload` without awaiting it (or the client aborts), cleanup
      runs while `_fileUploads` is still empty; the parse then writes
      files nobody tracks or deletes. Slow disk-fill.
      FIX: await the cached promise (catching) before the delete loop.
- [x] **DOCUMENTED, LEFT AS-IS 2026-08-14 (user decision: spec-compliant, so document rather than refuse).** Both the option JSDoc and the module docblock now spell out that this combination means reflect-any-origin-with-credentials and point to an explicit origin list/predicate instead.
      **M8 — `cors({origin:'*', credentials:true})` silently becomes
      reflect-any-origin-with-credentials.** `[✓insp]`
      `middlewares/cors.ts:58`. The spec-compliant echo is implemented
      correctly, but the combination means any site can make
      credentialed cross-origin calls. Most frameworks refuse it
      outright; we accept it silently.
- [ ] **DEFERRED — user will decide the policy later (2026-08-14).**
      **M9 — `stateKey` options corrupt across concurrent invocations
      under `stateMode: 'SHARE'`.** `[✓insp]` `responseTimer.ts:44-46`,
      `requestId.ts:36-38`. SHARE hands every context the same bag, so
      concurrent invocations overwrite each other's per-invocation
      values — for `requestId.stateKey` that is correlation-id
      corruption. Default CLONE/PROTOTYPE are safe; the docs don't warn.

## LOW

- [x] **FIXED 2026-08-14 — guidance inverted and shown as a worked example (rAPId decorator must sit ABOVE any wrapper).**
      **L1 — the wrapping-decorator guidance in `registry.ts:11-14` is
      exactly BACKWARDS.** `[✓exec]` It says rAPId decorators must be
      "OUTERMOST (closest to the method)" with wrappers "above" them —
      verified: that placement SILENTLY LOSES the route (the wrapper's
      replacement function is what lands on the prototype, and it
      carries no metadata). The working placement is the opposite:
      rAPId decorator FURTHEST from the method, wrapper below it.
- [x] **FIXED 2026-08-14 — the cap is checked as entries ACCUMULATE, so it bounds the work, not just the result. Default also lowered to 5 (user).**
      **L2 — `maxSorts` is enforced after the loop**, so a hostile
      `?sort1=..&sort2=..&…` accumulates and sorts everything before
      throwing (bounded by URL length, not by the cap).
      `parseQueryFilters.ts:195-227`.
- [x] **FIXED 2026-08-14 — plain decimal digits only, and `page` is now CLAMPED to a configurable `server.paging.maxPage` (default 1000, user).**
      **L3 — `positiveInt` accepts hex/octal/binary** (`?page=0x10` →
      page 16) and `page` has NO upper clamp (only `size` is clamped),
      so `?page=1e15` yields an astronomical offset.
      `utils/parsePaging.ts:43-50,107`.
- [x] **FIXED 2026-08-14 — `params` is frozen on all three contexts, so the advertised Readonly holds at runtime.**
      **L4 — frozen args are SHALLOW**: `params` is the raw frame
      payload / router params object, unfrozen and shared, so
      `ctx.args.params.x = 'y'` mutates the original.
- [x] **FIXED 2026-08-14 — new `ctx.status` getter exposes the INTERPRETED status (null content no longer hides a 401); requestLogger reads it.**
      **L5 — `requestLogger` can log 204 where the transport sends the
      real status**, because the response getter returns `null` for
      null content regardless of `_status`. Same conflation lets the
      return-value channel overwrite a null-content response.
- [x] **FIXED 2026-08-14 — Vary:origin stamped for every origin-bearing request (allowed or not) and APPENDED, so an app’s own Vary survives.**
      **L6 — `cors` `Vary`**: not stamped for disallowed origins (cache
      poisoning across origins) and uses `set` not `append`, clobbering
      an app's own `Vary`.
- [x] **FIXED 2026-08-14 — the getter returns a Headers COPY, matching responseHeaders.**
      **L7 — `HTTPContext.response` getter leaks the LIVE `_headers`**
      object while `responseHeaders` deliberately returns a copy.
- [x] **FIXED 2026-08-14 — dead `_files` removed; a real `RapidUploadedFile` type documents the per-field shape the parser actually emits.**
      **L8 — `RapidHTTPRequestBody._files` is declared but never
      emitted** — `collectFormData` attaches files under their field
      key. Dead type surface.
- [x] **FIXED 2026-08-14** (alongside M7 — each delete is individually
      try/caught and logged).
      **L9 — `cleanup`'s delete loop aborts on first failure**, leaking
      every later temp file.
- [x] **FIXED 2026-08-14 — plain-object check (Object.prototype or null proto); Date/Map/array rejected with the constructor name in details.**
      **L10 — SOCKET arg guard accepts exotic objects** (`Date`, `Map`,
      `Uint8Array`) that spread to empty params. Unreachable via JSON
      frames today.

## Deferred to the modules round (not defects)

- Base-class-decorated method OVERRIDDEN in a subclass: name-keyed
  mount drops the base route; identity-keyed mount runs the BASE body
  on a subclass instance. The registry key is sound — the mount tier
  must pick a policy (dedupe by name + identity re-check, or reject).
- Runtime re-check of the return envelope and arity underflow / `any`
  escapes (the compile contract's known holes).

## Reviewer claims that did NOT survive verification

- "Contextual inference can still flex binder types / narrowing hole":
  refuted — the decorator target is checked CONTRAVARIANTLY, so
  `param('id')` into `id: number` AND into `id: 'admin'` both error.
- "`this`-incompatible methods slip through": refuted — `This` is
  inferred at the application site and does error.
- "Legacy-mode detection has false positives/negatives": refuted —
  standard contexts always carry `kind`; no legacy shape produces one.
- "`compose` double-`next()`/re-entrancy can corrupt the index":
  refuted by trace — `index` only advances and each `_invoke` builds a
  fresh closure.
- "`rateLimit` off-by-one / prune evicts live windows / late-rejection
  swallow hides real errors": all refuted by trace.
- "`{...job.args, ...overrides}` is pollution-prone": refuted — object
  spread uses define semantics, not the `__proto__` setter.
