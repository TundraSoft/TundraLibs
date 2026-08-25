# Slogger Handlers

Built-in log handlers for various output destinations.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Handler Types](#handler-types)
- [Console Handler](#console-handler)
- [File Handler](#file-handler)
- [HTTP Handler](#http-handler)
- [Syslog Handler](#syslog-handler)
- [TCP Handler](#tcp-handler)
- [Stream Handler](#stream-handler)
- [Memory Handler](#memory-handler)
- [Blackhole Handler](#blackhole-handler)
- [Custom Handlers](#custom-handlers)
- [Handler Options](#handler-options)
- [Examples](#examples)

## Overview

Handlers control where and how logs are output. Each handler can have its own:

- Minimum log level
- Formatter
- Sampling configuration
- Handler-specific options

## Handler Types

| Handler          | Description                               | Use Case                                 | Bun | Deno | Node.js |
| ---------------- | ----------------------------------------- | ---------------------------------------- | --- | ---- | ------- |
| ConsoleHandler   | Colorized console output                  | Development, debugging                   | ✅  | ✅   | ✅      |
| FileHandler      | Buffered file writing                     | Production logging                       | ✅  | ✅   | ✅      |
| HTTPHandler      | Batched HTTP delivery                     | Remote logging services                  | ✅  | ✅   | ✅      |
| SyslogHandler    | RFC 5424 over TCP, UDP, or UNIX socket    | Syslog daemons (rsyslog, journald)       | ✅  | ✅   | ✅      |
| TCPHandler       | Line-delimited or octet-counted TCP       | Logstash, Fluentd, Vector                | ✅  | ✅   | ✅      |
| StreamHandler    | Write to any `WritableStream`             | gzip, stdout, in-memory test sinks       | ✅  | ✅   | ✅      |
| MemoryHandler    | In-process ring buffer of structured logs | Test assertions, dev tools, panic replay | ✅  | ✅   | ✅      |
| BlackholeHandler | No-op handler                             | Testing, benchmarking                    | ✅  | ✅   | ✅      |

## Console Handler

Outputs logs to the console with optional colorization.

### Configuration

```typescript ignore
{
  name: 'console',
  type: 'ConsoleHandler',
  level: SyslogSeverities.DEBUG,
  useColor: false, // Enable colors (default: false)
  formatter: 'standard'
}
```

### Options

- `useColor` (boolean) - Enable/disable colored output (default: `false`)
- `level` (SyslogSeverities) - Minimum log level
- `formatter` (string | SloggerFormatter) - Output formatter

### Example

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'DevApp',
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.DEBUG,
    useColor: true,
    formatter: 'detailed',
  }],
});

logger.info('Development server started', { port: 3000 });
```

### Features

- Automatic severity-based colorization
- Human-readable timestamp formatting
- Context object pretty-printing
- Supports all string formatters

## File Handler

Writes logs to files with automatic rotation and buffering.

> **A successful write is not persistence.** On Cloudflare Workers only
> `/tmp` is writable, and it is an in-memory filesystem: writes succeed,
> read back, and report a size — then vanish by the very next request
> (workerd's own guarantee on `/tmp` is per-request, not "eventually,
> when the isolate recycles"). (Every other path there, `./app.log` or
> `/var/log/app.log`, fails loudly at open instead.) When the handler
> opens its log file it asks the filesystem for its capacity, and a
> filesystem that reports none gets one `console.error` per handler. It
> is a warning, not an error: a scratch path may well be deliberate. If
> in-process buffering is what you actually want, use `MemoryHandler`.

### Configuration

```typescript ignore
{
  name: 'file',
  type: 'FileHandler',
  level: SyslogSeverities.INFO,
  directory: './logs/${date}',
  filenameTemplate: 'app-${hour}.log',
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MiB
  bufferSizeBytes: 4096, // bytes
  formatter: 'json'
}
```

### Options

- `directory` (string) - Directory path for log files (supports variables)
- `filenameTemplate` (string) - Log file name (supports variables)
- `maxFileSizeBytes` (number) - Maximum file size in **bytes** before rotation (default: `52_428_800` = 50 MiB)
- `bufferSizeBytes` (number) - Write buffer size in bytes (default: `4096`)
- `level` (SyslogSeverities) - Minimum log level
- `formatter` (string | SloggerFormatter) - Output formatter

### Supported Variables

Variables in `directory` and `filenameTemplate` are automatically replaced:

- `${name}` - Handler name
- `${date}` - Current date (YYYY-MM-DD)
- `${year}` - Current year (YYYY)
- `${month}` - Current month (MM)
- `${day}` - Current day (DD)
- `${hour}` - Current hour (HH)

### Example

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'ProdApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'app-logs',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs/${date}',
    filenameTemplate: 'app-${hour}.log',
    maxFileSizeBytes: 100 * 1024 * 1024, // Rotate after 100MB
    bufferSizeBytes: 8192, // 8KB buffer
    formatter: 'json',
  }],
});

logger.info('Request processed', {
  method: 'GET',
  path: '/api/users',
  statusCode: 200,
});
```

### Features

- Automatic file rotation based on size
- Buffered writes for performance
- Variable substitution in paths
- Automatic directory creation

### Performance

- Buffered writes reduce I/O operations
- Async file operations don't block logging
- Automatic buffer flushing on process exit
- Throughput: ~35,000 ops/sec with 4KB buffer

## HTTP Handler

Sends logs to HTTP endpoints with batching and retry logic.

### Configuration

```typescript ignore
{
  name: 'remote',
  type: 'HTTPHandler',
  level: SyslogSeverities.WARNING,
  url: 'https://logs.example.com/api/ingest',
  method: 'POST',
  batchSize: 50,
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  formatter: 'json'
}
```

### Options

- `url` (string) - HTTP endpoint URL
- `method` (`'POST' | 'PUT'`) - HTTP method (required)
- `batchSize` (number) - Number of logs to batch before sending (default: `1`)
- `maxBufferSize` (number) - Cap on the in-memory queue (pending batch +
  retry backlog), in log records (default: `10_000`; must be >=
  `batchSize`). When a persistently failing endpoint would push the
  queue past the cap, the **oldest** records are dropped first and the
  handler's `droppedLogCount` counter increments by the number dropped
  — bounded data loss instead of unbounded memory growth.
- `headers` (Record<string, string>) - Custom HTTP headers
- `level` (SyslogSeverities) - Minimum log level
- `formatter` (string | SloggerFormatter) - Output formatter

### Example

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'CloudApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'datadog',
    type: 'HTTPHandler',
    level: SyslogSeverities.INFO,
    url: 'https://http-intake.logs.datadoghq.com/v1/input/YOUR_API_KEY',
    method: 'POST',
    batchSize: 100,
    headers: {
      'Content-Type': 'application/json',
    },
    formatter: 'json',
  }],
});

logger.info('Application event', {
  eventType: 'user_login',
  userId: '12345',
});
```

### Features

- Automatic batching for efficiency
- Retry logic for failed requests (failed batches stay queued)
- Bounded retry queue: `maxBufferSize` cap with drop-oldest policy and
  a `droppedLogCount` counter
- Async delivery doesn't block logging
- Buffer flushing on process exit

### Integration Examples

#### Datadog

```typescript ignore
{
  name: 'datadog',
  type: 'HTTPHandler',
  level: SyslogSeverities.INFO,
  url: 'https://http-intake.logs.datadoghq.com/v1/input/YOUR_API_KEY',
  headers: { 'Content-Type': 'application/json' },
  formatter: 'json'
}
```

#### Elasticsearch

```typescript ignore
{
  name: 'elasticsearch',
  type: 'HTTPHandler',
  level: SyslogSeverities.INFO,
  url: 'https://your-cluster.com/_bulk',
  headers: {
    'Authorization': 'Basic ' + btoa('user:pass'),
    'Content-Type': 'application/x-ndjson'
  },
  formatter: customElasticsearchFormatter
}
```

#### Custom Service

```typescript ignore
{
  name: 'custom',
  type: 'HTTPHandler',
  level: SyslogSeverities.INFO,
  url: 'https://your-service.com/logs',
  method: 'PUT',
  headers: {
    'X-API-Key': process.env.LOG_API_KEY,
    'Content-Type': 'application/json'
  },
  formatter: 'json'
}
```

## Syslog Handler

Ships logs to a syslog daemon (rsyslog, syslog-ng, journald) in RFC
5424 wire format, over TCP, UDP, or a UNIX socket. Setting `formatter`
on this handler has no effect — the wire shape is fixed at RFC 5424;
use `appendContext` (below) to control how `context` flows into the
MSG body.

> **No retry, no queue, no backoff.** TCP/UNIX open one persistent
> connection on first log and re-dial on the next write after any
> failure; UDP is fire-and-forget with no acknowledgement at all
> (matching the classic rsyslog `*.* @host:514` config). Pair with a
> wrapping handler if you need delivery guarantees. UDP has no
> datagram sockets on Cloudflare Workers — use TCP there.

### Configuration

```typescript ignore
{
  name: 'syslog',
  type: 'SyslogHandler',
  level: SyslogSeverities.INFO,
  transport: { type: 'tcp', host: 'logs.example.com', port: 514 },
  // transport: { type: 'udp', host: 'logs.example.com', port: 514 },
  // transport: { type: 'unix', path: '/dev/log' },
  facility: SyslogFacilities.LOCAL3,   // RFC 5424 facility (default: USER)
  appName: 'api-gateway',              // overrides SlogObject.appName in the frame
  framing: 'octet-count',              // 'octet-count' (TCP default) | 'lf' (UNIX default)
  appendContext: (ctx) => JSON.stringify(ctx), // fold context into MSG (default: dropped)
}
```

### Options

- `transport` (`{type:'tcp',host,port}` | `{type:'udp',host,port}` |
  `{type:'unix',path}`) - required. TCP/UDP for a remote daemon (often
  port 514, or 6514 with TLS); UNIX socket for the local daemon
  (`/dev/log` on Linux, `/var/run/syslog` on macOS).
- `facility` (`SyslogFacilities` | number) - RFC 5424 facility code
  (0-23), encoded into PRI alongside severity (default: `USER` = 1).
- `appName`, `hostname`, `procId`, `messageId` - override the
  corresponding RFC 5424 header field; `procId` defaults to the
  current PID, the rest default to the `SlogObject`'s own fields (or
  the NILVALUE `-` for `messageId`).
- `appendContext` (`(context) => string`) - by default MSG is just
  `log.message` and `context` is dropped; pass a function to render
  context into the message tail.
- `framing` (`'octet-count'` | `'lf'`) - RFC 6587 TCP framing.
  `'octet-count'` (default for TCP) prefixes `<byte-length>`, binary
  safe; `'lf'` (default for UNIX) appends `\n`. Ignored for UDP (the
  datagram boundary IS the framing).
- `level` (SyslogSeverities) - Minimum log level.

### Example

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'api-gateway',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'syslog',
    type: 'SyslogHandler',
    level: SyslogSeverities.INFO,
    transport: { type: 'tcp', host: 'logs.example.com', port: 514 },
    appName: 'api-gateway',
  }],
});

logger.info('Request handled', { path: '/api/users', status: 200 });
```

### Features

- RFC 5424-compliant framing (`<PRI>1 TIMESTAMP HOSTNAME APP-NAME
  PROCID MSGID STRUCTURED-DATA MSG`), verified against strict parsers
  (rsyslog `mmnormalize`, syslog-ng `flags(syslog-protocol)`)
- Header fields are truncated to their RFC 5424 length caps
  (APP-NAME 48, HOSTNAME 255, PROCID 128, MSGID 32 octets) rather than
  rejected
- The MSG body is sanitised against embedded control bytes (including
  `\n`), closing a log-forging hole where attacker-controlled text
  could otherwise inject a second forged frame under `'lf'` framing

## TCP Handler

Opens a persistent TCP connection and writes formatted log records to
it — the same wire primitive as `SyslogHandler`, minus the RFC 5424
framing opinion. Pick any formatter (JSON, logfmt, plain text —
anything returning a string).

> **No retry, no queue, no backoff.** Lazy connect on first log; a
> write failure drops the connection so the next record re-dials.
> Typical targets: Logstash TCP input (5044/5000), Fluentd
> `in_forward`/`in_tcp` (24224/5170), Vector `socket` source, or any
> generic line-delimited TCP sink.

### Configuration

```typescript ignore
{
  name: 'logstash',
  type: 'TCPHandler',
  level: SyslogSeverities.INFO,
  host: 'logstash.internal',
  port: 5044,
  framing: 'lf',        // 'lf' (default) | 'octet-count'
  formatter: 'json',
}
```

### Options

- `host` (string) - Remote host (DNS name or IP). Required.
- `port` (number) - Remote port, 1-65535. Required.
- `framing` (`'lf'` | `'octet-count'`) - `'lf'` (default) appends
  `\n`, the line-delimited convention Logstash/Fluentd/Vector expect.
  `'octet-count'` prefixes `<byte-length>` (RFC 6587 §3.4.1) —
  binary-safe, pick this if records can contain newlines.
- `level` (SyslogSeverities) - Minimum log level.
- `formatter` (string | SloggerFormatter) - Output formatter (any
  formatter; unlike `SyslogHandler`, nothing is fixed here).

### Example

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'logstash',
    type: 'TCPHandler',
    level: SyslogSeverities.INFO,
    host: 'logstash.internal',
    port: 5044,
    formatter: 'json',
  }],
});

logger.info('order placed', { orderId: 'o_1001' });
```

## Stream Handler

Writes formatted log records to any web-standard `WritableStream` —
the most primitive transport handler in the package: zero opinion
about the destination, just plumbs strings/bytes into a stream.
Backpressure is honoured via `writer.ready`, so a slow consumer slows
the producer down rather than growing an unbounded in-memory queue.

### Configuration

```typescript ignore
{
  name: 'capture',
  type: 'StreamHandler',
  level: SyslogSeverities.INFO,
  stream: someWritableStream,  // WritableStream<Uint8Array> by default
  useTextMode: false,          // true for a WritableStream<string> sink
  terminator: '\n',            // per-record separator; '' to disable
  closeOnFinalize: true,       // false to only release the writer lock
  formatter: 'json',
}
```

### Options

- `stream` (`WritableStream`) - The destination. Required. Byte mode
  by default (`WritableStream<Uint8Array>` — a file, stdout, a
  `CompressionStream`, a socket); set `useTextMode: true` for a
  `WritableStream<string>` sink.
- `useTextMode` (boolean) - Treat the stream as accepting `string`
  chunks, skipping UTF-8 encoding (default: `false`).
- `terminator` (string) - Per-record separator appended after each
  formatted line (default: `'\n'`, NDJSON-friendly; `''` disables it).
- `closeOnFinalize` (boolean) - `finalize()` calls `writer.close()` by
  default; set `false` if the stream is shared with other writers and
  this handler shouldn't own its lifecycle (only the writer lock is
  released instead).
- `level` (SyslogSeverities) - Minimum log level.
- `formatter` (string | SloggerFormatter) - Output formatter.

### Example: in-memory capture for tests

Fully portable — no runtime-specific stream source needed:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const chunks: string[] = [];
const stream = new WritableStream<string>({
  write: (chunk) => {
    chunks.push(chunk);
  },
});

const logger = new Slogger({
  appName: 'TestApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'capture',
    type: 'StreamHandler',
    level: SyslogSeverities.INFO,
    stream,
    useTextMode: true,
    formatter: 'json',
  }],
});

logger.info('captured');
await logger.finalize();
// chunks now holds the formatted NDJSON lines
```

### Composing with web-streams primitives

```ts ignore
// Gzipped log file (Deno)
const file = await Deno.open('logs.gz', { write: true, create: true });
const gzip = new CompressionStream('gzip');
gzip.readable.pipeTo(file.writable);
new StreamHandler('gz', {
  level: SyslogSeverities.INFO,
  stream: gzip.writable,
});
```

## Memory Handler

An append-only ring buffer holding the last `capacity` **structured**
`SlogObject` records — not formatted strings — so callers can re-format
or inspect specific fields. Zero I/O, zero policy.

### Configuration

```typescript ignore
{
  name: 'recent',
  type: 'MemoryHandler',
  level: SyslogSeverities.DEBUG,
  capacity: 500, // max records retained; oldest evicted first (default: 100)
}
```

### Options

- `capacity` (number) - Maximum records retained; a positive integer
  (default: `100`). Allocated up front, so memory use is fixed for the
  handler's lifetime — it never grows past `capacity` records.
- `level` (SyslogSeverities) - Minimum log level.

### Methods

Beyond the common handler surface, `MemoryHandler` exposes:

- `getLogs(): SlogObject[]` - Snapshot the buffer, oldest-first. Returns
  a fresh array; mutating it does not affect the underlying buffer.
- `size: number` - Current record count (`0..capacity`).
- `capacity: number` - The configured maximum.
- `clear(): void` - Drop all stored records.

### Example: test assertions

```typescript
import {
  LogManager,
  MemoryHandler,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const memory = LogManager.createHandler('MemoryHandler', 'recent', {
  level: SyslogSeverities.DEBUG,
  capacity: 50,
}) as MemoryHandler;

const logger = new Slogger({
  appName: 'TestApp',
  level: SyslogSeverities.DEBUG,
});
logger.registerHandler(memory);

logger.info('user signed in', { userId: 'u_1' });

const logs = memory.getLogs();
if (logs.length !== 1 || logs[0]!.message !== 'user signed in') {
  throw new Error('expected exactly one captured record');
}
```

### Use Cases

- **Test assertions** - register a `MemoryHandler`, exercise code,
  then inspect the buffer for the records you expect
- **Dev tooling / debug pages** - expose the last N logs over an admin
  endpoint (`/admin/recent-logs`)
- **Panic replay** - route normal traffic to disk at WARNING+; install
  a `MemoryHandler` at DEBUG capturing the last 500 records; on
  EMERGENCY/ALERT, flush the buffer as a postmortem dump

## Blackhole Handler

A no-op handler that discards all logs. Useful for testing and benchmarking.

### Configuration

```typescript ignore
{
  name: 'null',
  type: 'BlackholeHandler',
  level: SyslogSeverities.DEBUG
}
```

### Example

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

// Testing environment
const logger = new Slogger({
  appName: 'TestApp',
  level: SyslogSeverities.ERROR,
  handlers: [{
    name: 'test',
    type: 'BlackholeHandler',
    level: SyslogSeverities.INFO,
  }],
});

// Logs are discarded - no output
logger.info('This will not be output');
logger.debug('Neither will this');
```

### Use Cases

- Unit tests where logging output is not needed
- Performance benchmarking
- Temporarily disabling logging
- Load testing without I/O overhead

## Custom Handlers

Create custom handlers by extending `AbstractHandler`:

```typescript
import {
  AbstractHandler,
  type HandlerOptions,
} from '@tundralibs/slogger/handlers';
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

class CustomHandler extends AbstractHandler {
  public readonly mode = 'custom';

  constructor(
    name: string,
    options: HandlerOptions & { customOption?: string },
  ) {
    super(name, options);
    // Initialize custom handler
  }

  // `message` is the record already rendered by this handler's formatter.
  protected async _handle(message: string): Promise<void> {
    // Custom log handling logic
    await this.customLogic(message);
  }

  private async customLogic(message: string): Promise<void> {
    // Implementation
  }

  public override async init(): Promise<void> {
    // Optional: Initialize resources
  }

  public override async finalize(): Promise<void> {
    // Optional: Cleanup resources
  }
}

// Register with LogManager
import { LogManager } from '@tundralibs/slogger';
LogManager.addHandler('custom', CustomHandler);

// Use in configuration
const logger = new Slogger({
  appName: 'App',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'custom-handler',
    type: 'custom',
    level: SyslogSeverities.INFO,
    customOption: 'value',
    formatter: 'json',
  }],
});
```

## Handler Options

### Common Options

All handlers support these common options:

```typescript
import type { SloggerFormatter, SyslogSeverities } from '@tundralibs/slogger';

interface HandlerOptions {
  level: SyslogSeverities; // Minimum log level
  formatter?: string | SloggerFormatter; // Output formatter
  sampling?: { // Sampling configuration
    sampleRate: number; // 0.0-1.0 (0.1 = 10%)
    bypassSamplingForLevel?: SyslogSeverities; // Always log at/above this level
  };
}
```

### Per-Handler Sampling

```typescript
import { SyslogSeverities } from '@tundralibs/slogger';

handlers: [
  {
    name: 'debug-logs',
    type: 'FileHandler',
    level: SyslogSeverities.DEBUG,
    sampling: {
      sampleRate: 0.05, // Sample 5% of debug logs
      bypassSamplingForLevel: SyslogSeverities.ERROR, // Always log errors
    },
  },
];
```

## Examples

### Multiple Handlers with Different Levels

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MultiHandler',
  level: SyslogSeverities.DEBUG,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.DEBUG,
      formatter: 'detailed',
    },
    {
      name: 'info-file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'info.log',
      formatter: 'json',
    },
    {
      name: 'error-file',
      type: 'FileHandler',
      level: SyslogSeverities.ERROR,
      directory: './logs',
      filenameTemplate: 'errors.log',
      formatter: 'detailed',
    },
    {
      name: 'remote-errors',
      type: 'HTTPHandler',
      level: SyslogSeverities.ERROR,
      url: 'https://logs.example.com/errors',
      batchSize: 10,
      formatter: 'json',
    },
  ],
});
```

### High-Volume Application

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'HighVolume',
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: 'sampled-file',
    type: 'FileHandler',
    level: SyslogSeverities.DEBUG,
    directory: './logs',
    filenameTemplate: 'app.log',
    bufferSizeBytes: 16384, // 16KB buffer
    formatter: 'json',
    sampling: {
      sampleRate: 0.01, // Sample 1% of logs
      bypassSamplingForLevel: SyslogSeverities.WARNING, // Always log warnings+
    },
  }],
});
```

### Development vs Production

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const isDev = Deno.env.get('ENV') === 'development';

const logger = new Slogger({
  appName: 'App',
  level: isDev ? SyslogSeverities.DEBUG : SyslogSeverities.INFO,
  handlers: isDev
    ? [{
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.DEBUG,
      useColor: true,
      formatter: 'detailed',
    }]
    : [
      {
        name: 'file',
        type: 'FileHandler',
        level: SyslogSeverities.INFO,
        directory: '/var/log/app',
        filenameTemplate: 'app.log',
        maxFileSizeBytes: 100 * 1024 * 1024,
        formatter: 'json',
      },
      {
        name: 'errors',
        type: 'HTTPHandler',
        level: SyslogSeverities.ERROR,
        url: Deno.env.get('LOG_ENDPOINT'),
        formatter: 'json',
      },
    ],
});
```

## Related Documentation

- [Formatters](../formatters/Slogger-Formatters.md) - Available log formatters
- [Configuration](../docs/Slogger-Configuration.md) - Complete configuration guide
- [Performance](../docs/Slogger-Performance.md) - Performance tuning
- [Examples](../docs/Slogger-Examples.md) - More usage examples

---

[← Back to Slogger](../README.md)
