# Slogger

A cross-runtime structured logger that fans a single log record out to
many wire formats in-process — console, JSON, syslog, file, HTTP, TCP —
without external workers, transports, or sidecar processes.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

`logger.info('user signed in', { userId })` can simultaneously:

- pretty-print a colored line to the console
- write a JSON record to a rotating file
- emit an RFC 5424 syslog frame over UDP to a collector
- POST a batched payload to an HTTP log ingester
- bind a Date object directly into a prepared-statement INSERT to a
  database row

…all from the **same call**, no external transport process required.
That's the design goal. The canonical `SlogObject` carries pre-cached
forms (`date`, `isoDate`, `timestamp`, `id`, `levelName`) so each
destination pulls the shape it needs without recomputation. Per-handler
filtering, sampling, and pattern-based data masking are first-class.

| Destination                | What it pulls from `SlogObject`                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Console / plain-text       | Template like `[${isoDate}] [${levelName}] ${message}`                                     |
| JSON (ELK, Loki, Datadog…) | Full structured record, or a flattened subset                                              |
| RFC 5424 syslog (UDP/TCP)  | `level` → PRI byte, `isoDate` → RFC 3339 TIMESTAMP, `hostname`, `appName`, `id`, `message` |
| Database row               | `id` (PK), `timestamp` or `date`, `level`, structured `context` blob                       |
| OpenTelemetry log record   | `timestamp` (epoch ns), `level` → SeverityNumber, `message` → Body, `context` → Attributes |
| HTTP push (aggregator)     | JSON or vendor shape, batched                                                              |

## Compared to other loggers

Slogger sits in the same tier as Winston and log4js-node: **in-process
multi-handler fan-out, multi-format**. It is not in the same tier as
Pino — and not trying to be. Pino's design philosophy is the inverse:
JSON-only in-process, with pretty-printing / file rotation / transports
delegated to worker threads via `pino-pretty` / `pino-roll` /
`pino-transport`. Slogger keeps everything in-process so one log call
can fan out to many destination shapes; that's the trade.

**When to use Slogger:** you need one record to fan out to multiple
destinations of different shapes (console + syslog + DB + OTEL), you
want to run on Deno/Bun/Node from one codebase, you don't want to
manage worker-thread transports, and Winston-tier per-call cost (~1-5 µs)
fits your workload.

**When to use Pino instead:** your only destination is JSON to stdout
or a single file, log throughput is the bottleneck, and you're happy
to run external processes for everything else. Pino is meaningfully
faster on the JSON-only hot path — pick the model that matches your
deployment.

See [docs/Slogger-Performance.md](docs/Slogger-Performance.md) for the
honest per-call cost breakdown.

## Browser / Worker compatibility

`@tundralibs/slogger` is designed for server-side application logging
and is not a browser/worker-first runtime, so there's no blanket
badge — but the handler-level split is sharper than "server-only":
`FileHandler` genuinely needs a real filesystem and won't work in a
browser. On Workers it does work — reads/writes land in workerd's
`/tmp` — but a record is gone by the very next request, not merely
when the isolate eventually recycles; the handler detects this at
open and warns once per instance. `TCPHandler` and `SyslogHandler`'s
TCP transport dial out through `@tundralibs/compat/net`, which
connects directly on Cloudflare Workers via `cloudflare:sockets` — no
`nodejs_compat` flag needed — but still has nothing to dial from a
browser. `SyslogHandler`'s UDP transport (no datagram sockets on
Workers) and UNIX-socket transport (workerd's `connect()` dials TCP
only) stay host-runtime-only everywhere else. `ConsoleHandler`, `MemoryHandler`,
`BlackholeHandler`, and `StreamHandler` (any web-standard
`WritableStream` — compose it with `CompressionStream`, a browser's
own stdout-equivalent, or an in-memory sink) have no such dependency
and are genuinely portable. `HTTPHandler` ships logs over `fetch`, so
it's edge-safe too, modulo one Deno-specific pre-flight permission
check that no-ops elsewhere. Restrict a browser/Worker bundle to the
handlers your target actually supports.

## Modules

| Module                                         | Description                                 | Documentation                            |
| ---------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| [Formatters](formatters/Slogger-Formatters.md) | JSON, string, and masking formatters        | [Docs](formatters/Slogger-Formatters.md) |
| [Handlers](handlers/Slogger-Handlers.md)       | Console, File, HTTP, and Blackhole handlers | [Docs](handlers/Slogger-Handlers.md)     |

## Installation

**Deno:**

```bash
deno add @tundralibs/slogger
```

**Bun:**

```bash
bunx jsr add @tundralibs/slogger
```

**Node.js:**

```bash
npx jsr add @tundralibs/slogger
```

**Direct import (Deno):**

```typescript
import { Slogger } from 'jsr:@tundralibs/slogger';
```

## Quick Start

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

// Basic usage
const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: 'standard',
  }],
});

logger.info('Application started', { port: 3000, env: 'production' });
logger.error('Database connection failed', { host: 'localhost', port: 5432 });
```

## Features

| Feature                     | Bun | Deno | Node.js |
| --------------------------- | --- | ---- | ------- |
| Structured logging          | ✅  | ✅   | ✅      |
| Multiple handlers           | ✅  | ✅   | ✅      |
| JSON formatter              | ✅  | ✅   | ✅      |
| String formatters           | ✅  | ✅   | ✅      |
| Masking formatter           | ✅  | ✅   | ✅      |
| Console handler             | ✅  | ✅   | ✅      |
| File handler                | ✅  | ✅   | ✅      |
| HTTP handler                | ✅  | ✅   | ✅      |
| Lazy context evaluation     | ✅  | ✅   | ✅      |
| Log sampling                | ✅  | ✅   | ✅      |
| Per-handler level filtering | ✅  | ✅   | ✅      |
| Automatic file rotation     | ✅  | ✅   | ✅      |
| Batch HTTP delivery         | ✅  | ✅   | ✅      |

### Key Features

#### Hot-path optimizations

- **Two-level filter** — log-level check first; handler-level check
  before any object construction. Below-threshold calls return in
  near-constant time.
- **Lazy context evaluation** — pass a `() => LogContext` thunk to
  defer context computation until after filters pass.
- **Lazy `id` (ULID) and `isoDate`** — both are getters on the
  `SlogObject`; handlers that don't read them pay nothing.
- **Static-message fast path** — `info('user signed in')` skips the
  template-substitution pass entirely (no regex when no `${` in the
  message).
- **Pre-compiled formatters** — string formatters parse their template
  once at construction; rendering is literal-append + property-read,
  no regex per log.
- **Synchronous `log()`** — handlers buffer internally; the caller
  never waits on I/O.
- **Bound-context child loggers** — `log.scope({reqId})` returns a
  lightweight wrapper that pre-merges context; root logger pays zero
  overhead for the feature.

#### Multiple Handlers

- **Console** - Colorized console output
- **File** - Buffered file writing with automatic rotation
- **HTTP** - Batched HTTP endpoint delivery with retry logic
- **Blackhole** - No-op handler for testing

#### Rich Formatters

- **JSON** - Structured JSON output
- **String variants** - Standard, detailed, compact, minimalist, key-value
- **Masking** - Automatic sensitive data redaction
- **Custom** - Extensible formatter system

#### Security & Safety

- Data masking with pattern-based detection
- Full TypeScript support
- Graceful error handling and fallback
- Comprehensive input validation
- **Messages are emitted verbatim by default** — `${...}` placeholders in
  a log message are _not_ interpolated against the context unless you
  opt in (see [Message interpolation](#message-interpolation) below). This
  prevents log-injection / data-exfiltration when a message can carry
  attacker-controlled text.

## Advanced Configuration

Multiple handlers with different configurations:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'HighVolumeApp',
  level: SyslogSeverities.DEBUG,
  handlers: [
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'app.log',
      maxFileSizeBytes: 100 * 1024 * 1024, // 100 MiB
      formatter: 'json',
    },
    {
      name: 'http',
      type: 'HTTPHandler',
      level: SyslogSeverities.ERROR,
      url: 'https://logs.example.com/ingest',
      batchSize: 100,
      formatter: 'json',
    },
  ],
  sampling: {
    sampleRate: 0.1, // Sample 10% of logs
    bypassSamplingForLevel: SyslogSeverities.ERROR, // Always log errors
  },
});
```

### Message interpolation

By default the log **message** is passed through to handlers **verbatim**.
Structured context is always available to handlers/formatters, but the
message string itself is never substituted against it:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({ appName: 'MyApp', level: SyslogSeverities.INFO });

// Message stays literal — `${user}` is NOT replaced.
logger.info('hello ${user}', { user: 'alice' });
// → message: "hello ${user}", context: { user: "alice" }
```

If you want `${path}` placeholders in the message resolved against the
context, set `interpolateMessage: true`:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  interpolateMessage: true, // opt in
});

logger.info('hello ${user.name}', { user: { name: 'alice' } });
// → message: "hello alice"
```

> ⚠️ **Security:** only enable `interpolateMessage` when log messages are
> developer-controlled. With it on, a `${...}` placeholder in an
> attacker-controlled message resolves against the context object, so an
> attacker could exfiltrate sensitive fields (`${apiKey}`,
> `${user.password}`). Prototype-chain access (`${constructor}`,
> `${__proto__.x}`) is always rejected, but the safe default is to leave
> interpolation off and pass already-formatted strings (e.g. template
> literals) instead.

### Automatic context (`contextProvider`)

A logger-level `contextProvider` is invoked on every emitted record and merged
**under** the call/scope context (explicit fields always win). It's the seam for
folding request-scoped context in automatically — pair it with
`@tundralibs/ambient` so every line carries the request's correlation id with no
per-call argument:

```typescript
import { LogManager, SyslogSeverities } from '@tundralibs/slogger';
// Needs a separate install: deno add @tundralibs/ambient
import { ambient } from '@tundralibs/ambient';

const log = LogManager.createSlogger({
  appName: 'orders',
  level: SyslogSeverities.INFO,
  contextProvider: () => ambient.get() ?? {}, // the seam
});

ambient.run({ correlationId: crypto.randomUUID() }, () => {
  log.info('charging'); // context includes { correlationId }
});
```

Precedence is **provider < scope < per-call**:

```typescript
import type { Slogger } from '@tundralibs/slogger';

declare const log: Slogger; // the logger created above

log.scope({ svc: 'auth' }).info('done', { attempt: 2 });
// context: { ...provider(), svc: 'auth', attempt: 2 }
```

The provider is called **lazily** — only for records that pass the level/handler
filters, so muted lines never invoke it. Like formatters, it is compared by
**reference identity** for `LogManager` caching: hoist it to a stable `const`
rather than passing a fresh arrow to each `createSlogger` call.

For trace ids, `tracer` (>= 0.4) ships the bound adapter for this seam —
`contextProvider: tracer.logContext` — emitting the canonical keys
`otelLogFormatter` hoists into first-class OTel fields. The full correlation
story is in [Slogger-Correlation](docs/Slogger-Correlation.md).

## Core API

### Slogger Class

Main logging class with methods for all syslog severity levels:

```typescript ignore
const logger = new Slogger(options: SloggerOptions);

// Logging methods (highest to lowest severity)
logger.emergency(message: string, context?: LogContext | (() => LogContext));
logger.alert(message: string, context?: LogContext | (() => LogContext));
logger.critical(message: string, context?: LogContext | (() => LogContext));
logger.error(message: string, context?: LogContext | (() => LogContext));
logger.warning(message: string, context?: LogContext | (() => LogContext));
logger.notice(message: string, context?: LogContext | (() => LogContext));
logger.info(message: string, context?: LogContext | (() => LogContext));
logger.debug(message: string, context?: LogContext | (() => LogContext));

// Bound-context child logger (see ScopedSlogger below)
logger.scope(bindings: LogContext): ScopedSlogger;

// Utility methods — root logger only
logger.registerHandler(handler: AbstractHandler): void;
await logger.finalize(): Promise<void>;
```

### ScopedSlogger

`scope()` returns a `ScopedSlogger`: a lightweight view over the root
logger that pre-merges `bindings` into every record. It carries the
whole logging surface (`log()`, every severity method, and a nested
`scope()` that composes) but **not** `finalize()` or
`registerHandler()` — a scope owns no handlers, so those two live on
the root logger alone. Calling them on a scope is a compile error;
finalize the root instead, which flushes every scope taken from it.

A full `Slogger` is assignable to `ScopedSlogger`, so a helper that
only logs should take the narrower type and accept either:

```typescript
import type { ScopedSlogger } from '@tundralibs/slogger';

function handle(log: ScopedSlogger, id: string): void {
  log.info('handled', { id });
}
```

### LogManager Singleton

Manages handlers and formatters globally:

```typescript ignore
import { LogManager } from '@tundralibs/slogger';

// Register custom handlers and formatters
LogManager.addHandler('custom', CustomHandlerClass);
LogManager.addFormatter('custom', customFormatterFunction);

// Create loggers with registered components
const logger = LogManager.createSlogger(options);
```

`createSlogger` caches one instance per `appName`. Repeating the call
with a structurally identical config returns the cached instance;
passing a _different_ config for the same `appName` throws a
`SloggerConfigError` (the new config would otherwise be silently
ignored). Formatter (and other function) values are compared by
**reference identity**, not source text — a function's behavior depends
on the options it closed over, which `.toString()` can't see. So a fresh
inline `maskingFormatter({...})` built per call is a _different_ config
and throws; to reuse the cached instance, hoist the formatter to a shared
`const fmt = maskingFormatter({...})` and pass that same reference on
every call. (Reference identity is what stops a masking-`ssn` logger from
being silently handed to a caller that asked for masking-`ssn`+`password`.)
Use `LogManager.getLogger(appName)` to retrieve an existing instance
without restating its config.

Both `createSlogger(config, scopes)` and `getLogger(name, scopes)` take
an optional second argument of pre-bound context fields. With it they
return a `ScopedSlogger` (the root stays cached unscoped); without it
they return the root `Slogger`, `finalize()` included.

### Errors

Everything the package throws derives from `SloggerError` (which
extends `BaseError` from `@tundralibs/utils`), so callers can branch
with `instanceof`:

```typescript
import {
  SloggerConfigError, // invalid/conflicting options, registrations, lookups
  SloggerError, // package base class
  SloggerFinalizeError, // one or more handlers failed during finalize()
  SloggerHandlerError, // runtime delivery/persistence failure in a handler
} from '@tundralibs/slogger/errors';
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

try {
  await logger.finalize();
} catch (e) {
  if (e instanceof SloggerFinalizeError) {
    for (const { handler, error } of e.failures) {
      console.error(`handler ${handler} failed to flush:`, error);
    }
  }
}
```

`Slogger.finalize()` always finalizes **every** handler — a failing
handler cannot prevent the others from flushing — and then surfaces
the collected failures as a single `SloggerFinalizeError`.

## Documentation

- [Formatters](formatters/Slogger-Formatters.md) - All available formatters
- [Handlers](handlers/Slogger-Handlers.md) - All available handlers
- [Configuration](docs/Slogger-Configuration.md) - Detailed configuration guide
- [Performance](docs/Slogger-Performance.md) - Performance optimization guide
- [Security](docs/Slogger-Security.md) - Security and data masking
- [Examples](docs/Slogger-Examples.md) - Common usage patterns
- [Migration](docs/Slogger-Migration.md) - Migration from other loggers
- [Recipes](docs/Slogger-Recipes.md) - Custom handlers to build per-vendor
  (webhooks, queues, DB sinks)
- [Correlation](docs/Slogger-Correlation.md) - Logs that know their request and
  their trace: contextProvider + ambient + tracer + the OTel formatter

## License

MIT
