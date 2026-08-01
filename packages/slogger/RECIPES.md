# Slogger Recipes

> **Status: TODO — stubs only.** These are the canonical "you can build
> this yourself in an afternoon" extensions to slogger that we
> deliberately don't ship in-tree. Each entry below sketches the API
>
> - the policy choices the user has to make. Future doc passes should
>   flesh these out into runnable example code.
>
> The design intent: **slogger ships the nuts and bolts (handlers +
> formatters with zero policy), users assemble higher-level
> behaviour.** Register custom handlers via `LogManager.addHandler()`
> so they're resolvable by name in configs.

---

## 1. Webhook handler (Slack / Discord / PagerDuty / Teams)

**Why not in-tree:** every webhook target has its own JSON shape,
rate-limit policy, format choices (threading, mentions, attachments),
and dedup rules. Shipping one means picking defaults that almost
nobody actually wants. Build per-vendor.

**Sketch:**

```ts
import { AbstractHandler, type HandlerOptions } from '@tundralibs/slogger';

type SlackHandlerOptions = HandlerOptions & {
  webhookUrl: string;
  channel?: string;
  username?: string;
  // Only forward CRITICAL+ — slack is for humans, not log streams.
  minSeverity?: SyslogSeverities;
  rateLimitPerMin?: number;
};

class SlackHandler extends AbstractHandler {
  public readonly mode = 'slack';
  // ... constructor validates webhookUrl, etc.
  // ... maintain in-memory token-bucket for rate limit
  // ... map SlogObject → Slack message payload
  // ... POST to webhookUrl on _handle()
}
```

**Policy choices the user owns:**

- Which severities forward? (probably ERROR+ only.)
- Rate limit? (`5/min`, `1/15s burst`, etc.)
- Message shape: emoji per severity? Code blocks? Threading replies on
  the same root incident?
- Dedup window? (Silence the same error within N minutes.)
- On webhook failure: retry? Drop? Fail silently?

---

## 2. Batching wrapper handler

**Why not in-tree:** batch size, flush interval, and backpressure
behaviour are all policy. Different consumers want different
trade-offs. Look at how `HTTPHandler` does batching internally —
factor it out for your wire format if you want.

**Sketch:**

```ts
import { AbstractHandler, type HandlerOptions } from '@tundralibs/slogger';
import type { SlogObject } from '@tundralibs/slogger';

type BatchingHandlerOptions = HandlerOptions & {
  inner: AbstractHandler;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueLength?: number; // drop-oldest when full
};

class BatchingHandler extends AbstractHandler {
  public readonly mode = 'batching';
  private _queue: SlogObject[] = [];
  private _timer?: number;
  // ... handle() pushes to queue, schedules flush
  // ... flush() drains queue → inner.handle() per record (or batched
  //     write if inner supports it)
}
```

**Policy choices:**

- Drop-oldest vs drop-newest when the queue fills?
- Flush on `flushIntervalMs` only, or also when the queue reaches
  `batchSize`?
- Synchronous flush on `finalize()`?

---

## 3. Dedup / rate-limit wrapper handler

**Why not in-tree:** the dedup key function and window size are
inherently per-app. Spammy code paths look different in every codebase.

**Sketch:**

```ts
type DedupHandlerOptions = HandlerOptions & {
  inner: AbstractHandler;
  windowMs: number;
  // Default key: hash of (level + message). Override for finer control.
  keyFn?: (log: SlogObject) => string;
};

class DedupHandler extends AbstractHandler {
  public readonly mode = 'dedup';
  private _seen = new Map<string, number>(); // key → last-seen-at
  // ... handle() computes key; if last-seen < windowMs ago, drop; else
  //     update timestamp and delegate to inner
}
```

**Policy choices:**

- Key function: hash message only? Include context fields?
- TTL eviction (so the Map doesn't grow unbounded)?
- On dedup-drop, emit a "you suppressed N similar messages" summary?

---

## 4. Vendor-specific HTTP handlers (Datadog / Loki / Splunk / NewRelic)

**Why not in-tree:** each vendor wants their own JSON envelope,
custom headers, batch limits, retry semantics. Build one per vendor
or use a generic HTTPHandler with the vendor's JSON formatter.

**Generic recipe — DatadogHandler:**

```ts
// Use the existing HTTPHandler + a custom formatter:
const datadogFormatter = (log: SlogObject): string =>
  JSON.stringify({
    ddsource: 'tundra-slogger',
    ddtags: `env:prod,service:${log.appName}`,
    hostname: log.hostname,
    service: log.appName,
    message: log.message,
    status: log.levelName.toLowerCase(),
    ...log.context,
  });

new HTTPHandler('dd', {
  level: SyslogSeverities.INFO,
  url: 'https://http-intake.logs.datadoghq.com/api/v2/logs',
  method: 'POST',
  batchSize: 100,
  headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY },
  formatter: datadogFormatter,
});
```

For **Loki**: similar pattern, push `application/json` to
`/loki/api/v1/push` with their `streams` envelope.

For **Splunk HEC**: POST to `/services/collector/event` with
`Authorization: Splunk <token>` and the `{event, source, ...}` envelope.

**Policy choices the user owns:**

- API key from where? (env var, secrets manager, IAM role?)
- Retry / backoff strategy on 5xx / 429?
- Buffer-on-down behaviour?
- Multi-region failover?

---

## 5. Async transport wrapper (worker-thread / off-loop)

**Why not in-tree:** runtime-specific. Node has `worker_threads`, Deno
has `Worker`, Bun has both — they're API-compatible but worker
lifecycle and serialization differ. Adopt the runtime's idiomatic
worker pattern and pipe the `SlogObject` (or its JSON form) over
postMessage.

This is the path to "match pino's worker-transport throughput" but
it's deliberately scoped out of the cross-runtime core.

---

## 6. UDP transport (for SyslogHandler and standalone)

**Pending compat layer work.** `@tundralibs/compat/net` only exposes
TCP + UNIX socket today. UDP needs:

- Deno: `Deno.connectDatagram({ port, transport: 'udp' })` →
  `.send(data, addr)`
- Node: `node:dgram` → `socket.send(buf, port, host, cb)`
- Bun: `Bun.udpSocket({ port, socket: ... })`

Adding `connectDatagram()` / `listenDatagram()` to compat is its own
~150 LOC PR. Once that lands:

- Extend `SyslogTransport` with `{ type: 'udp', host, port }`.
- Add a separate `UDPHandler` for non-syslog UDP destinations
  (statsd-style metric+log push, etc.).

---

## Index of skipped-by-design (deliberately user territory)

| Recipe                                             | Why user-owned                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| **Webhook handler** (Slack/Discord/PagerDuty)      | Per-vendor JSON shape, rate limit, threading, dedup              |
| **Batching wrapper**                               | Batch size, flush cadence, backpressure are policy               |
| **Dedup / rate-limit wrapper**                     | Key function and window are app-specific                         |
| **Vendor-specific HTTP** (DD/Loki/Splunk/NewRelic) | Each vendor's envelope + auth + retry differs                    |
| **Async transport (worker thread)**                | Runtime-specific; out of cross-runtime scope                     |
| **CSV / TSV formatter**                            | Niche; rare to want CSV logs                                     |
| **`StderrHandler`**                                | Trivial — just `ConsoleHandler({ stream: 'stderr' })` once added |

## What slogger ships in-tree (the "nuts and bolts")

### Handlers

| Name               | Use                                                               |
| ------------------ | ----------------------------------------------------------------- |
| `ConsoleHandler`   | stdout, optional colourisation                                    |
| `FileHandler`      | disk with rotation                                                |
| `HTTPHandler`      | POST/PUT batches to a URL                                         |
| `TCPHandler`       | line-delimited or octet-counted TCP socket                        |
| `SyslogHandler`    | RFC 5424 over TCP or UNIX socket                                  |
| `StreamHandler`    | write to any `WritableStream` (gzip, child process, websocket, …) |
| `MemoryHandler`    | ring buffer for tests / dev tools / panic-replay                  |
| `BlackholeHandler` | discard (load testing, conditional silencing)                     |

### Formatters

| Name                                                                                      | Use                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `simpleFormatter(template)`                                                               | Compile a `${var}` template once                   |
| `standardFormat`, `detailedFormat`, `compactFormat`, `minimalistFormat`, `keyValueFormat` | Pre-built text templates                           |
| `jsonFormatter`, `prettyJsonFormatter`                                                    | NDJSON / indented JSON                             |
| `rfc5424Formatter`                                                                        | RFC 5424 syslog wire format                        |
| `logfmtFormatter`                                                                         | `key=value key2="quoted"` (logfmt)                 |
| `otelLogFormatter`                                                                        | OpenTelemetry log-record JSON                      |
| `maskingFormatter`                                                                        | Wraps another formatter to redact sensitive fields |

---

> When one of these stubs gets fleshed out, move it to a separate
> file under `docs/recipes/` and remove it from this list.
