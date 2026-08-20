# WebSocket + cron implementation exploration

Uncommitted scratch report. Hands-on verified with
`.bench/cron-socket-explore.ts` (ran clean — output below) on top of reading the
actual source, not just the docs/tests.

## SOCKET (WebSocket)

- Not a separate transport file — mounted inside `HTTPTransport`
  (`__buildSocket`,
  [HTTPTransport.ts:112](../packages/rapid/transports/HTTPTransport.ts)), same
  port/TLS as HTTP. rAPId is a thin wrapper: one `rpc.command(name, handler)`
  registration per `@SOCKET`/`app.socket()` entry, `rpc.handlers()` becomes the
  `WebServer`'s `websocket` option.
- Client-side wire protocol is `@tundralibs/rpc`'s own `Client`:
  `new Client({ url: 'ws://host:port/ws', reconnect: { enabled: false } })` →
  `await ws.connect()` → `await ws.command(name, payload)` → `await ws.close()`.
  Verified live — round trip echoed the payload back correctly.
- Errors: same disclosure policy as HTTP
  (`RapidError.from(error).payload(mode)`), translated into rpc's thrown-error
  envelope by `utils/socketOutcome.ts`.
- **Gap confirmed by grep, not just by reading**:
  `rg 'publish|subscribe|broadcast|channel\('` across all of `packages/rapid`
  (excluding tests/examples) returns **zero hits**. `@tundralibs/rpc`'s `Server`
  has full pub/sub (`publish()`, subscribe/unsubscribe frames, a pluggable
  `PubSubAdapter` for cross-process fan-out) — none of it is exposed through
  rAPId's `Application`/`SOCKETContext` surface today. A module can only respond
  to the command it was invoked with; it cannot push to other connected clients
  or broadcast a channel. If server-initiated push (e.g. "new comment posted"
  fan-out to subscribers) is wanted, it needs a new `app.publish()`
  /`ctx.publish()` surface wired to the underlying `rpc` instance — currently
  unreachable from outside `HTTPTransport`.

## CRON (JOB)

- `JOBTransport` wraps `@tundralibs/cronus` (`unref: true`, so a pending tick
  can't block process shutdown). Minute-resolution, **no timezone param**, **no
  catch-up/misfire replay** (minutes passed while the process was down are
  dropped, by cronus's own documented contract) — worth knowing before relying
  on it for anything with a hard wall-clock SLA across restarts.
- Overlap protection: if a firing is still running when the next tick lands, the
  tick is **skipped** (not queued) — logged at DEBUG.
- `app.triggerJob(name, argsOverride)` bypasses the schedule entirely and
  **returns** the outcome (unlike a real scheduled tick, which only logs) — this
  is the testing/ops escape hatch, and it works even via a throwaway transport
  before `app.start()`.
- Verified live: two back-to-back `triggerJob('heartbeat')` calls against the
  SAME registered handler closure both incremented a shared `ticks` counter and
  returned `{status:200, content:{ticks:1|2}, handlerRan:true}` — confirms the
  handler instance (and any closed-over state) persists across firings within
  one process, exactly as a real cron handler would need.
- Error handling: one attempt per firing, no retry/backoff, process never
  crashes on a thrown handler error (same shared `_invoke` disclosure policy).
- **Gap**: no distributed/leader-election coordination — `jobs.enabled` is a
  per-replica boolean only. Running the same app config across N replicas fires
  every job N times. Fine for a single-instance deployment or externally-deduped
  jobs (idempotent by design); a real problem for anything that must fire
  exactly once across a horizontally-scaled fleet.

## Live verification output

```
started on 4010
triggerJob result: {"status":200,"content":{"ticks":1},"handlerRan":true}
triggerJob result (2nd call, same process): {"status":200,"content":{"ticks":2},"handlerRan":true}
socket echo result: {"echoed":{"hello":"world"}}
stopped cleanly
```

## Bottom line

Both transports are solid for a single-instance deployment with request/response
semantics. The two concrete gaps worth a design decision before leaning on them
further: **no server-push/broadcast** on SOCKET (the underlying rpc library has
it, rAPId just doesn't expose it), and **no multi-replica job coordination** on
JOB (fine today, becomes a real gap the moment `rapid-blog-example` — or
anything using `@JOB` — needs to scale past one instance).
