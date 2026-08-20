# WebServer perf review: requestId, outbound streaming, inbound translation

Answers to three specific questions, each verified against the actual
code/docs/repo-wide usage — not inferred. Git history dead-ends: this
file's history in THIS repo starts at `3512d646 feat: TundraLibs 1.0.0
monorepo baseline` (a squashed snapshot from the pre-monorepo codebase;
checked `origin/legacy` too — no deeper history there either), so "why"
below is reconstructed from the current code, its JSDoc, and
`Compat-WebServer.md`, not from commit messages.

## 1. `requestId`/`requestTime` — any use? why added?

**Documented intent** (`webserver/types/RequestInfo.ts`): `requestId` is
"UUID-v4 generated at request entry. Use for log correlation and for
forwarding as a trace header to downstream services." `requestTime` is
"When the request was received. Subtract from `Date.now()` for
duration." Both are exposed TWO ways: (a) directly, as the `info`
parameter every `handler(request, info)` receives, and (b) via the
`onResponse`/`onError` EventEmitter hooks — `Compat-WebServer.md`'s
"Events" section documents exactly this pattern:

```typescript
server.on('onResponse', (name, req, info, res) => {
  console.log(`[${info.requestId}] ${req.method} ${req.url} → ${res.status}`);
});
```

So the design is sound and intentional: a generic, zero-setup
observability primitive for consumers who use `WebServer` directly and
don't want to build their own request-correlation/timing from scratch.

**Verified real-world usage: none.** `grep -rn "info\.requestId\|
requestInfo\.requestId\|\.requestTime"` across every package in this
monorepo (excluding `WebServer.ts`/`RequestInfo.ts` themselves) returns
ZERO hits. Every actual consumer of `WebServer` — `rapid`'s
`HTTPTransport`, `rpc`'s `Server`, `radrouter`'s example — either
ignores `info` entirely or destructures only `remoteAddress`. None
register an `onResponse`/`onError` listener either.

**Why rapid specifically doesn't use it — not just redundancy, wrong
shape.** rapid's own `Application.newRequestId()`
(`packages/rapid/Application.ts`) ADOPTS a validated inbound
correlation-id header when present (trusted-edge reuse — `SAFE_REQUEST_ID`
regex-checked) and only mints a fresh ULID when absent or unsafe.
`WebServer`'s `requestId` is unconditionally `crypto.randomUUID()` —
always fresh, never adopts an inbound header — so even if rapid read it,
it wouldn't satisfy rapid's actual policy. rapid also feeds its id into
`ambient`/tracer correlation, which `WebServer`'s plain per-call value
has no hook into. The two systems solve the same problem at different
layers with different requirements; rapid's is a superset, so
`WebServer`'s version is simply never reached.

**Bottom line:** the feature is well-designed for `WebServer`'s own
target audience (a bare consumer with no framework), currently unused by
every consumer actually in this monorepo, and each unconditional
`crypto.randomUUID()` + `new Date()` (plus the metrics bookkeeping right
next to it — `_processRequest`, `WebServer.ts:1249-1257`) is pure waste
on every request from a rapid-shaped consumer's perspective. Not a design
flaw — a genuine "who pays for a feature nobody here uses" tradeoff.

## 2. Outbound streaming — why built this way?

**Not a deliberate streaming-as-a-feature choice — it's the only
mechanism Node's `http` module offers.** Compared all three runtime
processors directly:

- Deno (`denoProcessor`, `WebServer.ts:1649-1671`) and Bun
  (`bunProcessor`, `WebServer.ts:1374-1427`) both simply `return
  this._processRequest(request, requestInfo);` — the `Response` object
  goes straight back to `Deno.serve`/`Bun.serve`, which deliver its body
  (buffered or genuinely streamed) NATIVELY. Compat writes ZERO body-
  transmission code for these two runtimes.
- Node (`_startNodeServer`, `WebServer.ts:1924-1951`) is the only path
  with manual body handling, because Node's `http.ServerResponse` has no
  concept of a Fetch `Response`/`ReadableStream` at all — `res.write()`/
  `res.end()` only accept raw bytes/strings. Something has to drain
  `response.body.getReader()` and push chunks across; compat's code does
  that the general-purpose way (works for a 12-byte JSON body and a
  gigabyte file proxy identically), which is correct for the general
  case but means even the common small-body case pays for a
  `ReadableStream` reader plus at least one promise-resolution round
  trip that a hypothetical direct-buffer path wouldn't.

This mirrors the inbound side exactly: Deno/Bun get `Request` objects
for free from the runtime; Node needs `__nodeReqToFetchRequest` to build
one. Node is structurally the odd one out on BOTH directions, for the
same underlying reason (no Fetch API in Node's native HTTP stack).

## 3. Inbound translation — what can be optimized?

Concrete, scoped options (none implemented — this is the review the
user asked for, not a fix pass):

1. **Fast-path a fully-materialized response body on Node.** rapid's
   `serializeResponse.ts` already has the complete string/`Uint8Array`
   in hand before constructing a `Response` — most `WebServer` responses
   in practice are NOT genuinely streaming. Detecting that case (e.g. a
   small marker, or checking if the body was never a stream to begin
   with) and calling `res.end(buffer)` directly would skip the
   `ReadableStream` reader/pump entirely for the common case, falling
   back to the existing pump only for a body that's actually still
   producing data. Real complexity: distinguishing "body already fully
   available" from "body is streaming" generically, without depending
   on caller-supplied metadata `WebServer`'s public API doesn't have a
   slot for today.
2. **Skip the `Headers()`/`.append()` loop where it's safe to.**
   `__nodeReqToFetchRequest` (`WebServer.ts:2361-2369`) builds a
   `new Headers()` and appends every inbound header one at a time.
   `Request`'s constructor accepts a `HeadersInit` directly (a plain
   record or array of pairs), which could replace the loop for the
   common single-value-header case — but multi-value headers (repeated
   `x-forwarded-for`, `cookie`) need `.append()`'s accumulate-not-
   overwrite semantics, so a plain record shortcut would need to detect
   and special-case those, not just swap the whole loop out.
3. **Make `requestId`/`requestTime`/metrics conditional on demand.**
   Per finding #1: nobody in this monorepo reads them. A cheap, safe
   gate — mint `requestId` (`crypto.randomUUID()`) and `requestTime`
   (`new Date()`) only when the handler's arity suggests it reads
   `info`, OR (simpler, more reliable) only when at least one
   `onResponse`/`onError` listener is registered
   (`this._events.has(...)` or equivalent) — would remove that cost for
   every consumer that doesn't use the feature, while keeping it fully
   working for one that does.
4. **Not on the table:** dropping the Fetch-API-first contract for
   Node (i.e. having `WebServer` skip `Request`/`Response` entirely on
   Node and hand consumers Node's native types instead) — that breaks
   the one-shape-across-Deno/Bun/Node contract every consumer (rapid,
   rpc, radrouter) is written against; would trade one shared,
   once-documented cost for Node-specific branches in every consumer.

None of 1-3 are one-liners; each needs its own correctness pass
(especially #1's stream-vs-buffer detection and #2's multi-value-header
handling) and its own test coverage before landing, per this repo's
review conventions. Flagging for a decision, not implementing here.

## IMPLEMENTED (follow-up pass) — all three, measured

All three candidates above landed in `WebServer.ts`, with a
micro-benchmark pass FIRST to find where the Node gap actually lives:

| Per-request operation (Node 26, this machine)                  |            Cost |
| -------------------------------------------------------------- | --------------: |
| `new URL('/users/42', base)`                                   |         ~450 ns |
| `new Headers()` + 5 appends                                    |         ~760 ns |
| `new Request(...)` (floor, best-case inputs)                   | ~1,300-1,800 ns |
| **full inbound translation (before)**                          |   **~2,400 ns** |
| **full inbound translation (after: concat URL + pairs array)** |   **~1,830 ns** |
| `crypto.randomUUID()` + `new Date()`                           |         ~170 ns |
| `new Response(str)` (undici constructor alone)                 |       ~1,740 ns |
| draining the body stream after construction                    |      +50-300 ns |

The headline discovery: **undici's `Request`/`Response` constructors
are the whale** (~3.5µs combined per request), not the stream pump —
`new Response(str)` alone costs ~1.7µs and the reader drain adds
almost nothing on top. Those constructors are the price of the Fetch
contract itself on Node; `WebServer` cannot remove them without a
Hono-node-server-style "lightweight Request" impersonation, and the
matching Response-side trick is BLOCKED on Node 26+ (undici moved to
true `#private` fields — the internal body `source` is unreachable,
verified empirically, so a constructed Response can only be consumed
through the public stream API).

What landed:

1. **Inbound** — origin-form URLs built by string concat (Request's
   constructor parses the string anyway; the separate `new URL` pass
   was parsing everything twice) with `new URL` kept for the rare
   absolute-/asterisk-form targets; headers passed to `new Request` as
   a pairs array (one validation pass) instead of via an intermediate
   `Headers` + per-append validation. ~585 ns/request saved.
2. **requestInfo** — `requestId`/`requestTime` are now lazy cached
   getters (epoch millis captured at entry, so `requestTime` is still
   honest). Zero cost for the (universal, verified) consumers that
   never read them; identical observable behavior for any that do.
3. **Outbound** — single-chunk fast path: hold the first chunk, race
   the second read against a `setImmediate`; when the stream is done
   (every string/buffer-built Response — the second read of a
   materialized body settles in a microtask, deterministically beating
   the macrotask), the whole body goes out as ONE `res.end(chunk)` and
   Node emits **Content-Length instead of chunked framing**. A genuine
   stream loses the race and hands off to the old pump with at most
   one event-loop turn of added first-chunk latency — verified live
   (3 chunks 150ms apart arrived at 0/151/303ms).

Measured (paired A/B, both servers running simultaneously on Node,
alternating autocannon rounds — controls for machine drift):
baseline ~39.6-40.1k req/s vs optimized ~40.2-42.2k req/s across both
routes = **+2-5% throughput**, plus the wire-format improvement
(Content-Length responses instead of chunked). Modest by design: the
remaining ~30% gap to raw `node:http` is undici constructor cost, per
the table above. The next meaningful step, if ever wanted, is the
lightweight-Request scheme (Request-shaped object, lazy real-Request
materialization) — proven in hono/node-server but a materially bigger
correctness surface; not attempted.

Verified after the change: full compat suite green on Deno
(35/1032 steps), Bun (815), Node (778); rapid's suite green (221
steps); live behavioral checks for Content-Length on single-chunk,
progressive delivery on real streams, 204/null bodies, and lazy
requestId stability.
