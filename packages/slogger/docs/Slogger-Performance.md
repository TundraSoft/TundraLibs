# Slogger Performance

Honest accounting of what a Slogger `info()` call costs, why, and the
levers you have to tune it.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Performance tier](#performance-tier)
- [Hot-path cost breakdown](#hot-path-cost-breakdown)
- [Optimization techniques](#optimization-techniques)
- [Best practices](#best-practices)
- [Memory management](#memory-management)
- [Troubleshooting](#troubleshooting)
- [Benchmarking your configuration](#benchmarking-your-configuration)

## Performance tier

Slogger lives in the **in-process multi-destination tier** alongside
Winston and log4js-node. Order-of-magnitude per-call cost on a modern
machine (Apple M2 / Deno 2.7+):

| Tier                             | Per call    | Trade                                                                      |
| -------------------------------- | ----------- | -------------------------------------------------------------------------- |
| Pino, Bunyan (JSON-only)         | ~90-400 ns  | One destination, one format; everything else delegated to external workers |
| **Slogger, Winston, log4js**     | **~1-5 µs** | Multi-destination, multi-format, in-process; no worker threads or sidecars |
| `JSON.stringify` + `console.log` | ~5-10 µs    | No filtering, no buffering, blocks on flush, no destination flexibility    |

Slogger trades raw throughput for destination flexibility. If your only
destination is JSON to stdout or one file, **Pino will be faster** — by
roughly an order of magnitude. If you need one record to fan out to
console + syslog + a rotating file + an HTTP ingester + a DB row
without external worker processes, Slogger (or Winston) is what that
trade is for. Pick the model that matches your deployment.

## Hot-path cost breakdown

Where the per-call cost goes, in rough order:

1. **`SlogObject` construction** — fresh record per call. Includes `appName`, `hostname`, `levelName`, `level`, `context`, `message`, `date`, `timestamp`. `id` (ULID) and `isoDate` are lazy getters — handlers that don't read them pay nothing.
2. **Per-handler fan-out** — each handler gets the same `SlogObject` and produces its own wire output. Cost scales linearly with handler count.
3. **Formatter rendering** — string formatters are pre-compiled at construction (literal-append + property-read), so this is a tight loop rather than a regex per call.
4. **I/O dispatch** — handlers buffer internally and return immediately; the caller doesn't wait on actual writes.

What you don't pay (already optimised in the hot path):

- No regex on static messages (the `${`-presence check skips
  `variableReplacer` entirely when no template substitution is needed)
- No `JSON.stringify` per call for string formatters (the template is
  parsed once at construction)
- No `ulid()` per call when no handler reads `id`
- No `Date.toISOString()` per call when no handler reads `isoDate`
- No `new Date()` more than once per call (cached on the SlogObject)
- No `await` in `log()` itself (handlers are fire-and-forget; failures
  are swallowed at the handler boundary)
- No object construction when level filter + handler-level filter both
  rule out the call

## Two-level filtering

Below-threshold calls return in near-constant time:

1. **Log-level filter** — `if (level > this.level) return;` is the
   first statement in `log()`. ~ns.
2. **Handler-level filter** — walk handlers once to check if any will
   accept this severity. If none, `return;` before any object or
   string is constructed.

So `logger.debug('verbose detail', expensiveCtx)` at INFO level is
nearly free — no SlogObject, no ULID, no Date, no formatter.

## Optimization Techniques

### 1. Use Appropriate Log Levels

Set production log levels to INFO or higher:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'ProdApp',
  level: SyslogSeverities.INFO, // Skip DEBUG logs
  handlers: [/* ... */],
});
```

**Impact:**

- Eliminates DEBUG log processing overhead
- Reduces context evaluation
- Decreases I/O operations

### 2. Lazy Context Evaluation

Use functions for expensive context computation:

```typescript
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;
declare function expensiveCalculation(): unknown;
declare function gatherSystemInfo(): unknown;

// ❌ Bad: Always computed
logger.debug('User action', {
  result: expensiveCalculation(), // Always runs
  metadata: gatherSystemInfo(), // Always runs
});

// ✅ Good: Only computed if DEBUG is enabled
logger.debug('User action', () => ({
  result: expensiveCalculation(), // Only runs if needed
  metadata: gatherSystemInfo(), // Only runs if needed
}));
```

**Impact:**

- Avoids unnecessary computation when logs are filtered
- Reduces CPU usage in production
- Maintains debugging capability in development

### 3. Configure Sampling

Sample high-volume logs while preserving errors:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'HighVolume',
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: 'file',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    sampling: {
      sampleRate: 0.01, // Sample 1%
      bypassSamplingForLevel: SyslogSeverities.ERROR, // Always log errors
    },
  }],
});
```

**Impact:**

- Reduces log volume by 99%
- Preserves critical error logs
- Maintains statistical visibility

### 4. Optimize Buffer Sizes

Tune buffer sizes for your workload:

```typescript ignore
{
  name: 'high-throughput',
  type: 'FileHandler',
  level: SyslogSeverities.INFO,
  bufferSizeBytes: 16384, // 16KB for high volume
  maxFileSizeBytes: 100 * 1024 * 1024,  // Larger files before rotation
}
```

**Guidelines:**

- **Low volume** (< 100 logs/sec): 4KB (default)
- **Medium volume** (100-1000 logs/sec): 8KB
- **High volume** (> 1000 logs/sec): 16KB+

**Tradeoffs:**

- Larger buffers = Better throughput, slightly delayed writes
- Smaller buffers = More immediate writes, lower throughput

### 5. Batch HTTP Requests

Increase batch size for remote logging:

```typescript ignore
{
  name: 'remote',
  type: 'HTTPHandler',
  batchSize: 100, // Batch 100 logs per request
  level: SyslogSeverities.WARNING,
}
```

**Impact:**

- Reduces network overhead
- Improves throughput
- Lower HTTP connection count

### 6. Use JSON Formatter for Files

JSON formatting is the canonical structured-output format and avoids
the template-render path entirely:

```typescript ignore
{
  name: 'file',
  type: 'FileHandler',
  level: SyslogSeverities.INFO,
  formatter: 'json',
}
```

String formatters (standard / detailed / compact / minimalist) are
pre-compiled at construction, so the per-log cost is a small literal-
append + property-read loop rather than a regex per call. JSON is
slightly faster still because it skips the template machinery
entirely, but the difference is small enough that you should pick the
formatter that matches your destination, not the one that benchmarks
fastest in isolation.

### 7. Minimize Handler Count

Each handler adds overhead:

```typescript ignore
// ❌ Less efficient: 5 handlers
handlers: [
  { name: 'console', type: 'ConsoleHandler', level: SyslogSeverities.INFO },
  { name: 'debug-file', type: 'FileHandler', level: SyslogSeverities.INFO },
  { name: 'info-file', type: 'FileHandler', level: SyslogSeverities.INFO },
  { name: 'error-file', type: 'FileHandler', level: SyslogSeverities.INFO },
  { name: 'http', type: 'HTTPHandler', level: SyslogSeverities.INFO },
];

// ✅ More efficient: 2-3 handlers
handlers: [
  { name: 'console', type: 'ConsoleHandler', level: SyslogSeverities.INFO },
  { name: 'file', type: 'FileHandler', level: SyslogSeverities.INFO },
  { name: 'http', type: 'HTTPHandler', level: SyslogSeverities.ERROR },
];
```

## Best Practices

### Production Configuration

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'ProdApp',
  level: SyslogSeverities.INFO, // Skip debug logs
  handlers: [
    {
      name: 'app-logs',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: '/var/log/app',
      filenameTemplate: 'app.log',
      maxFileSizeBytes: 100 * 1024 * 1024,
      bufferSizeBytes: 16384, // 16KB buffer
      formatter: 'json', // Fast JSON formatter
    },
    {
      name: 'error-logs',
      type: 'FileHandler',
      level: SyslogSeverities.ERROR,
      directory: '/var/log/app',
      filenameTemplate: 'errors.log',
      formatter: 'json',
    },
    {
      name: 'remote-errors',
      type: 'HTTPHandler',
      level: SyslogSeverities.ERROR,
      url: Deno.env.get('LOG_ENDPOINT'),
      batchSize: 50,
      formatter: 'json',
    },
  ],
});
```

### High-Volume Configuration

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'HighVolumeApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'sampled-logs',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'app-${hour}.log', // Hourly rotation
    maxFileSizeBytes: 500 * 1024 * 1024, // Large files
    bufferSizeBytes: 32768, // 32KB buffer
    formatter: 'json',
    sampling: {
      sampleRate: 0.001, // 0.1% sampling
      bypassSamplingForLevel: SyslogSeverities.WARNING,
    },
  }],
});
```

### Development Configuration

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'DevApp',
  level: SyslogSeverities.DEBUG, // All logs
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.DEBUG,
    useColor: true,
    formatter: 'detailed', // Human-readable
  }],
});
```

### Conditional Logging

Minimize log calls in hot paths:

```typescript
import { type Slogger, SyslogSeverities } from '@tundralibs/slogger';

declare const logger: Slogger;
declare const item: unknown;
declare function expensiveMetadata(): unknown;

// ❌ Bad: String concatenation always happens
logger.debug('Processing item: ' + JSON.stringify(item));

// ✅ Good: Using context
logger.debug('Processing item', { item });

// ✅ Better: Lazy context for hot paths
logger.debug('Processing item', () => ({ item }));

// ✅ Best: Check level in critical paths
if (logger.level >= SyslogSeverities.DEBUG) {
  logger.debug('Processing item', () => ({
    item,
    metadata: expensiveMetadata(),
  }));
}
```

## Memory Management

### Buffer Management

File handlers use configurable buffers:

```typescript ignore
{
  name: 'file',
  type: 'FileHandler',
  level: SyslogSeverities.INFO,
  bufferSizeBytes: 4096, // 4KB default
}
```

**Memory formula:** `handlers × bufferSizeBytes`

Example:

- 3 file handlers × 4KB = 12KB buffer memory
- 3 file handlers × 16KB = 48KB buffer memory

### Context Object Size

Keep context objects reasonable:

```typescript
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;
declare const request: Request & { path: string };
declare const largeRequestBody: unknown;
declare const completeUserObject: unknown;
declare const user: { id: string };

// ❌ Large context (may cause memory pressure)
logger.info('Request', {
  body: largeRequestBody, // Potentially MBs
  allHeaders: request.headers, // Many headers
  fullUser: completeUserObject, // Large nested object
});

// ✅ Compact context
logger.info('Request', {
  method: request.method,
  path: request.path,
  userId: user.id, // Just the ID
  contentLength: request.headers.get('content-length'),
});
```

### Automatic Cleanup

Slogger automatically flushes buffers on process exit:

```typescript ignore
const logger = new Slogger(/* ... */);

// Automatic cleanup on process exit
// No manual cleanup needed

// Optional: Manual finalization
await logger.finalize();
```

## Troubleshooting

### High CPU Usage

**Symptoms:**

- Elevated CPU usage
- Slow response times
- High log throughput

**Solutions:**

1. **Increase log level:**

```typescript ignore
level: SyslogSeverities.INFO; // Skip DEBUG logs
```

2. **Enable sampling:**

```typescript ignore
sampling: {
  sampleRate: 0.1;
} // Sample 10%
```

3. **Use lazy context:**

```typescript ignore
logger.debug('Message', () => ({ expensive: computation() }));
```

4. **Reduce handler count:**

```typescript ignore
// Consolidate handlers
handlers: [
  { name: 'file', type: 'FileHandler', level: SyslogSeverities.INFO },
  { name: 'http', type: 'HTTPHandler', level: SyslogSeverities.ERROR },
];
```

### High Memory Usage

**Symptoms:**

- Growing memory usage
- Out of memory errors
- Large RSS

**Solutions:**

1. **Reduce buffer sizes:**

```typescript ignore
bufferSizeBytes: 2048; // 2KB instead of 16KB
```

2. **Increase flush frequency:**

```typescript ignore
maxFileSizeBytes: 10 * 1024 * 1024; // Smaller files, more frequent rotation
```

3. **Reduce batch sizes:**

```typescript ignore
batchSize: 10; // Smaller HTTP batches
```

4. **Compact context objects:**

```typescript ignore
// Only log essential fields
logger.info('Event', { id, type }); // Not entire objects
```

### Slow File I/O

**Symptoms:**

- High latency on file handler
- Blocking operations
- Slow log writes

**Solutions:**

1. **Increase buffer size:**

```typescript ignore
bufferSizeBytes: 16384; // 16KB for less frequent writes
```

2. **Use faster storage:**

- SSD instead of HDD
- RAM disk for extreme throughput
- Network storage with good I/O

3. **Separate logs by volume:**

```typescript ignore
handlers: [
  {
    name: 'high-volume',
    type: 'FileHandler',
    level: SyslogSeverities.DEBUG,
    directory: '/fast-storage/logs',
    sampling: { sampleRate: 0.01 },
  },
  {
    name: 'errors-only',
    type: 'FileHandler',
    level: SyslogSeverities.ERROR,
    directory: '/reliable-storage/logs',
  },
];
```

### HTTP Handler Timeouts

**Symptoms:**

- Failed HTTP requests
- Timeout errors
- Back pressure on logging

**Solutions:**

1. **Increase batch size:**

```typescript ignore
batchSize: 100; // Fewer requests
```

2. **Raise level threshold:**

```typescript ignore
level: SyslogSeverities.ERROR; // Only errors
```

3. **Add local fallback:**

```typescript ignore
handlers: [
  {
    name: 'http',
    type: 'HTTPHandler',
    level: SyslogSeverities.INFO,
    url: 'https://logs.example.com',
  },
  {
    name: 'local-backup',
    type: 'FileHandler',
    level: SyslogSeverities.ERROR,
    directory: './backup-logs',
  },
];
```

## Performance Testing

### Benchmark Your Configuration

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'BenchmarkApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'test',
    type: 'BlackholeHandler', // No I/O overhead
    level: SyslogSeverities.INFO,
  }],
});

const iterations = 100000;
const start = performance.now();

for (let i = 0; i < iterations; i++) {
  logger.info('Benchmark message', { iteration: i });
}

const duration = performance.now() - start;
const opsPerSec = (iterations / duration) * 1000;

console.log(`Throughput: ${opsPerSec.toFixed(0)} ops/sec`);
console.log(`Average latency: ${(duration / iterations).toFixed(3)}ms`);
```

## Related Documentation

- [Configuration](Slogger-Configuration.md) - Configuration guide
- [Handlers](../handlers/Slogger-Handlers.md) - Handler details
- [Examples](Slogger-Examples.md) - Usage examples

---

[← Back to Slogger](../README.md)
