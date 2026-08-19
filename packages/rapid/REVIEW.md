# rAPId phase-1 scratch — adversarial review (2026-08-12)

Findings from a three-way adversarial pass: the author's own empirical
tests + two independent fresh-eyes reviewers (lifecycle/scheduler,
HTTP-path/contexts), de-duplicated and severity-ranked. `[✓exec]` =
reproduced by running; `[✓insp]` = confirmed by code inspection.

**Verdict:** the architecture held under pressure; the bugs concentrate
in the three hard places — error classification, the lifecycle state
machine, and the scheduler arithmetic. This is the reconciliation
fix-list. Check items off as they land in the real package (WITH tests —
most are one assertion from being caught forever).

---

## 🔴 UGLY — security / silent-fatal (fix first)

- [x] **U1 — FIXED (Object.hasOwn) + pinned in Application.test.ts** `[✓exec]`
      `errors/Base.ts:92`. `from()` uses `code in RAPID_ERROR_CODES`, true
      for `constructor`/`toString`/`__proto__`/… A thrown error whose
      `context.code` collides → `status` = `undefined` → served **200 OK**,
      and `payload()` takes the 4xx branch → **leaks message + details in
      PRODUCTION**. Fix: `Object.hasOwn(RAPID_ERROR_CODES, code)`. One line.
- [x] **U2 — FIXED (#started flag + throwaway transport) + pinned** `[✓exec]`
      `Application.ts:398-401` (assign) vs `:316-318` (`running`) vs `:337`
      (`start` guard). Lazy-assigning `#jobTransport` flips `running` true →
      `start()` early-returns → HTTP never binds, app reports `running:true`.
      Fix: separate "constructed" from "started" state; don't gate `start()`
      on field presence.
- [x] **U3 — RESOLVED by the @tundralibs/cronus swap (tick-and-match never computes next-run)**
      `[✓exec]` `cron.ts:87-91`, `Scheduler.ts:197/202`, `JOBTransport.ts:38`.
      `0 0 30 2 *` (Feb 30) and far-off Feb-29 pass `assertTrigger` (parse
      only), then `nextRun`'s 366-day horizon **throws** at `start()` →
      propagates through `Application.start()` → tears down ALL transports
      (HTTP too), rethrows opaque "Internal server error" with no job name.
      Worse: `#scheduler` is assigned AFTER `scheduler.start()`, so a
      throwing job leaves an already-armed job's timer untracked → phantom
      fires. Fix: validate fireability at registration (skip-with-warn, not
      crash-boot); assign scheduler before arming; name the job in the error.
- [x] **U4 — GONE with the cronus swap (schedule type narrowed to cron strings)** `[✓insp]`
      `Scheduler.ts:47/188-190/206-212`. Chunk re-arm recomputes
      `from = now + interval` each wake → target marches forward forever,
      never converges (cron/one-shot are absolute, so they're fine). Fix:
      anchor interval targets to an absolute next-fire timestamp.
- [x] **U5 — FIXED — trustProxy is a HOP COUNT (default 0/secure); rightmost-hop selection + pinned**
      `HTTPContext.ts:105-123`, default `trustProxy:true` (`Options.ts:66`).
      Bare boolean, no proxy allowlist; picks the LEFTMOST (client-injected)
      XFF hop. Behind any LB the socket addr is private → filtered out →
      attacker's `x-forwarded-for`/`x-real-ip` becomes `remoteAddress`. Any
      rate-limit/audit keyed on it is spoofable. Fix: trusted-proxy config +
      rightmost-trusted hop selection.
- [x] **U6 — FIXED — byte-cap on bytes READ (chunked/lying-length safe) + pinned**
      Chunked (no content-length), missing, or lying header bypasses it →
      `text()/json()/formData()` buffer unbounded → memory-exhaustion DoS.
      Multipart too (`formData()` buffers fully before per-file `maxSize`).
      Fix: enforce a byte ceiling while reading the stream, not off the header.
- [~] **U7 — test suite STARTED (Application.test.ts: U1/U2/B3 pinned); request-path coverage pending** across 2,458 LOC. All verification was
  throwaway smoke. Stand up a real suite during reconciliation.

## 🟠 BAD — correctness / quality

- [x] **B1 — FIXED — malformed JSON → RAPID_VALIDATION_FAILED/400 + pinned**
      The `application/json` branch has no try/catch (the no-content-type
      branch does). SyntaxError → `RAPID_UNHANDLED` 500 (opaque in PROD) for a
      client error. Fix: wrap → `RAPID_VALIDATION_FAILED`/400.
- [x] **B2 — FIXED — body-only override preserves prior status + pinned**
      `_status = response?.status ?? 200` — a middleware re-setting `response`
      without `status` downgrades every 404/500 to 200. Fix: preserve prior
      status when the new payload omits it.
- [x] **B3 — FIXED (#started flag; events symmetric) + pinned** `[✓exec]`
      `Application.ts:337/343-352`. `running` false with no transport →
      repeated `start()` re-runs boot + re-emits `start`; paired `stop()`
      no-ops (asymmetric events). Fix: a real `#started` flag.
- [x] **B4 — GONE with the cronus swap (scratch lock store deleted)** `[✓insp]`
      `LockStore.ts:25-34`, `Scheduler.ts:221/235`. After a TTL-expiry
      overlap, a finishing job's `release()` deletes the NEW owner's lock →
      cascading overlap exactly when jobs are slow. Fix: fencing token /
      owner-checked release.
- [~] **B5 — teardown isolation FIXED (per-transport try/catch); job draining now cronus's domain**
  `[✓insp]` `Scheduler.ts:154-161`, `Application.ts:381-388`. A handler
  can run during/after shutdown (resources already torn down); a throwing
  `jobs.stop()` orphans the HTTP server (no try/finally). Fix: await
  in-flight drain; isolate the two teardowns.
- [x] **B6 — FIXED — respond()/cleanup() now run inside an ambient scope (logs correlated)**
      `Base.ts:40-70`, `JOBTransport.ts:83-90`, `HTTPTransport.ts:136-148`.
      `respond()` and the "job finished"/"cleanup failed" logs fire after the
      ambient scope closed → no requestId/trace on those lines. Fix: widen the
      ambient scope to cover respond + cleanup.
- [x] **B7 — FIXED — respond() wrapped in HTTPTransport; a throw becomes a disclosure-mode 500**
      `HTTPTransport.ts:136-138` (try/finally, no catch), `JOBTransport.ts:83`.
      Materialization runs outside `_invoke`'s protection; a throw (bad status
      RangeError, serialization) bypasses the disclosure override → raw server
      500. Fix: guard respond(), or make materialization non-throwing.
- [x] **B8 — FIXED — error-override set is try-guarded; a finalized response no longer throws out of _invoke**
      `Base.ts:55-68`, `HTTPTransport.ts:129`. If a middleware calls public
      `respond()` early then a later one throws, the catch's `ctx.response =`
      hits the freeze guard → `RAPID_RESPONSE_INVALID` escapes `_invoke`
      uncaught. Fix: don't expose `respond()`, or make the catch freeze-safe.
- [x] **B9 — OBSOLETE — cron correctness now lives in @tundralibs/cronus:**
  - `dow=7` (Sunday) rejected `[✓exec]` `cron.ts:22` — standard allows 0 and 7.
  - `-5` silently parses as `0-5` `[✓insp]` `cron.ts:36-44` (`Number('')===0`).
  - dom+dow is **AND**, standard cron is **OR** `[✓exec]` `cron.ts:72-78`.
  - interval drift accumulates (anchored to fire time) `[✓insp]` `:188-190`.
  - DST spring-forward skips / fall-back double-matches (local time) `[✓insp]`.
  - trailing segments silently dropped (`1-5/2/3`, `5-10-15`) `[✓insp]` `:28/36`.
- [x] **B10 — FIXED — route-registration message is a real template literal now**
      `Application.ts` (dup/invalid job), `HTTPTransport.ts:48` (route). Single-
      quoted, and BaseError templating resolves against `{code,details,debug}`
      only. Fix: `${details.name}` or real template literals.
- [x] **B11 — FIXED — S threaded through handlers/contexts/transports; ctx.state typed (pinned via @ts-expect-error)**
      `HTTPContext.ts:59` (`Context<RapidContextState, Response>`), `Base.ts:19`
      (`_app: Application`). Route handlers get base `RapidContextState`, not the
      app's `S` — the whole state-generic mechanism is inert for HTTP. Fix:
      thread `S` through `HTTPContext` and the transport.
- [x] **B12 — FIXED — empty handler → 204 No Content + pinned**
      `HTTPContext.ts:183-188`. A handler intending an empty 200 (or a
      status-only return) yields off-model 501. Fix: treat a ran-but-empty
      handler as 204/200; distinguish from never-dispatched.
- [x] **B13 — FIXED — repeated form fields normalise to arrays (no crash / no loss)**
      `HTTPContext.ts:302-315`. value-then-file → `push` on a string →
      TypeError → 500; file-then-value → silent overwrite (data loss). Fix:
      normalize field storage to arrays.
- [x] **B14 — FIXED — upload content check is MAGIC BYTES now, not a client-supplied MIME string**
      Skipped on empty content-type (client-controlled) and the type is
      client-supplied anyway. Fix: sniff magic bytes, or drop the pretense.
- [x] **B15 — FIXED — multipart exempt from the JSON body cap; multipart total = max(maxBodySize, uploads.maxSize)**
      Body gate (413) rejects >1MB uploads before the per-file cap applies.
      Fix: exempt multipart from the JSON body cap, or reconcile defaults.
- [x] **B16 — FIXED — requestId in error response bodies (matches 404) + pinned**
      it (`HTTPTransport.ts:122`) but `payload()` doesn't → 5xx/validation
      bodies lack it (header-only). Fix: include it in the error envelope too.
- [x] **B17 — FIXED — parse failures cached; a re-read replays the error, never re-reads the stream**
      `HTTPContext.ts:216/323`. A throwing first parse leaves `_requestBody`
      unset → second call re-reads the cancelled stream ("already consumed"),
      masking the real error. Fix: cache the rejection.

## 🟡 NITs

- [x] `compose` now SKIPS a nullish slot (handler still runs) (`utils/compose.ts:21`)
      instead of skipping it.
- [x] responseHeaders returns a COPY (live headers no longer leak past the freeze) — `response` getter / `responseHeaders`
      return the instance; direct mutation bypasses the freeze (`Base.ts:120`,
      `HTTPContext.ts:149/168`).
- [x] `set-cookie` APPENDED on override (never collapsed) (`.set()` +
      `Headers.entries()`) — `HTTPContext.ts:134-141`.
- [x] Server span carries `http.request.method` + `http.route` (passed from HTTPTransport) — status-on-span still deferred; original: (status-on-span deferred — needs respond-in-span) — `http.request.method` / `http.response.status_code` /
      route attributes, no error status stamped (`Base.ts` span block).
- [x] Job failures log once — "job finished" is debug-only (error detail comes from _invoke).
- [x] 204/304 drop content-type and body (`HTTPContext.ts:189-210`).
- [x] Out-of-range status RangeError now caught by the respond() guard (B7) (`:209`).
- [x] OBSOLETE — scheduler replaced by @tundralibs/cronus — `JOBTransport.triggerNow` reimplements
      it, the two can diverge.

## 🟢 GOOD — held up under attack

- Error disclosure ladder is correct for **legitimate** codes (4xx keeps
  details/hides debug; 5xx opaque in PROD). U1 is the classification hole,
  not the ladder.
- Config-driven architecture, grouped options, factory — clean, survived.
- `Transport` base + shared `_invoke` cycle — the cure for the prototype's
  four-different-cycles disease (audit D5).
- SERVER span joins an inbound `traceparent` — observability spine works.
- State CLONE (deep-with-reference-fallback) — better than Oak (never drops
  unclonables).
- Scheduler _shape_ (unref timers, re-arm-before-run, trigger triad, the
  lock-store seam that doubles as cluster leader-election) is right — the
  bugs are arithmetic, not design.
- Two-tier product statement; radrouter integration (path rewrite,
  matched-pattern naming) works as designed.

---

## Fix-first order

1. **U1** (error `in`→`hasOwn`) — security, one line.
2. **U2 / B3** — lifecycle state machine (`#started` flag; stop gating triggerJob).
3. **U3 / U4** — scheduler silent-fatals (validate fireability; anchor intervals).
4. **U5 / U6 / B1** — IP trust + body cap + JSON-400 (the request-path security set).
5. **U7** — real test suite (retires most of the above permanently).
