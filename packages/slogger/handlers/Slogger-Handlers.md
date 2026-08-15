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

| Handler          | Description              | Use Case                | Bun | Deno | Node.js |
| ---------------- | ------------------------ | ----------------------- | --- | ---- | ------- |
| ConsoleHandler   | Colorized console output | Development, debugging  | ✅  | ✅   | ✅      |
| FileHandler      | Buffered file writing    | Production logging      | ✅  | ✅   | ✅      |
| HTTPHandler      | Batched HTTP delivery    | Remote logging services | ✅  | ✅   | ✅      |
| BlackholeHandler | No-op handler            | Testing, benchmarking   | ✅  | ✅   | ✅      |

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
> read back, and report a size — then vanish when the isolate recycles.
> (Every other path there, `./app.log` or `/var/log/app.log`, fails loudly
> at open instead.) When the handler opens its log file it asks the
> filesystem for its capacity, and a filesystem that reports none gets one
> `console.error` per handler. It is a warning, not an error: a scratch
> path may well be deliberate. If in-process buffering is what you
> actually want, use `MemoryHandler`.

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
