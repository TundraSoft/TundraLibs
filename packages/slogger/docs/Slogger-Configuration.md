# Slogger Configuration

Complete configuration guide for Slogger.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Configuration Overview](#configuration-overview)
- [SloggerOptions](#sloggeroptions)
- [Handler Configuration](#handler-configuration)
- [Log Levels](#log-levels)
- [Sampling Configuration](#sampling-configuration)
- [Environment-Based Configuration](#environment-based-configuration)
- [Advanced Patterns](#advanced-patterns)

## Configuration Overview

Slogger configuration consists of three main components:

1. **Application settings** - App name, global log level
2. **Handlers** - Output destinations with their own settings
3. **Sampling** - Optional global or per-handler log sampling

## SloggerOptions

The main configuration object for creating a Slogger instance.

```typescript
import type {
  HandlerConfig,
  LogContext,
  SamplingOptions,
  SyslogSeverities,
} from '@tundralibs/slogger';

interface SloggerOptions {
  appName: string; // Application identifier, max 30 chars
  level: SyslogSeverities; // Global minimum log level
  handlers?: HandlerConfig[]; // Handler configurations (omit for a silent no-op logger)
  sampling?: SamplingOptions; // Optional global sampling
  interpolateMessage?: boolean; // Resolve ${path} in the MESSAGE against context (default: false — see below)
  contextProvider?: () => LogContext; // Per-record context merged UNDER call/scope context
}
```

`handlers` is optional — a `Slogger` built without it silently discards
everything, which is occasionally useful as a test/placeholder logger
(equivalent to a single `BlackholeHandler`, minus even the sampling
check). `interpolateMessage` and `contextProvider` are covered in the
README's
[Message interpolation](../README.md#message-interpolation) and
[Automatic context](../README.md#automatic-context-contextprovider)
sections — not repeated here, since `interpolateMessage`'s security
rationale is the kind of thing that drifts if maintained in two
places.

### appName

String identifier for your application. Appears in all log entries.

```typescript ignore
const logger = new Slogger({
  appName: 'MyApp',
  // ...
});
```

**Best practices:**

- Use consistent naming across your application
- Keep it short and descriptive
- Use environment-aware names: `MyApp-Dev`, `MyApp-Prod`

### level

Global minimum severity level. Controls which logs are processed.

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO, // Only INFO and above
  // ...
});
```

See [Log Levels](#log-levels) for details.

### handlers

Array of handler configurations. Each handler represents an output destination.

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.DEBUG,
      formatter: 'standard',
    },
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'app.log',
      formatter: 'json',
    },
  ],
});
```

See [Handler Configuration](#handler-configuration) for details.

### sampling

Optional global sampling configuration applied to all handlers.

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.DEBUG,
  handlers: [/* ... */],
  sampling: {
    sampleRate: 0.1, // Sample 10% of logs
    bypassSamplingForLevel: SyslogSeverities.ERROR, // Always log errors
  },
});
```

See [Sampling Configuration](#sampling-configuration) for details.

## Handler Configuration

Each handler requires a configuration object with common and handler-specific options.

### Common Handler Options

```typescript
import type {
  SamplingOptions,
  SloggerFormatter,
  SyslogSeverities,
} from '@tundralibs/slogger';

interface HandlerConfig {
  name: string; // Unique handler identifier, max 30 chars
  type: string; // Handler type (a name registered on LogManager)
  level: SyslogSeverities; // Minimum level for this handler — required, no default
  formatter?: string | SloggerFormatter; // Output formatter (default: standardFormat)
  sampling?: SamplingOptions; // Per-handler sampling
  [key: string]: unknown; // Handler-specific options
}
```

### Handler Types

- `'ConsoleHandler'` - Console output
- `'FileHandler'` - File output
- `'HTTPHandler'` - HTTP endpoint
- `'SyslogHandler'` - RFC 5424 syslog over TCP/UDP/UNIX socket
- `'TCPHandler'` - Raw line-delimited or octet-counted TCP
- `'StreamHandler'` - Any web-standard `WritableStream`
- `'MemoryHandler'` - In-process ring buffer of structured records
- `'BlackholeHandler'` - No output
- Custom types registered via `LogManager.addHandler()`

Full option lists and runnable examples for every type live in
[Handlers](../handlers/Slogger-Handlers.md) — the four newer handlers
below (`SyslogHandler`, `TCPHandler`, `StreamHandler`, `MemoryHandler`)
are only summarised here.

```typescript ignore
// SyslogHandler — see Slogger-Handlers.md#syslog-handler
{
  name: 'syslog',
  type: 'SyslogHandler',
  level: SyslogSeverities.INFO,
  transport: { type: 'tcp', host: 'logs.example.com', port: 514 }, // or 'udp' | 'unix'
  facility: SyslogFacilities.LOCAL3,   // default: USER
}

// TCPHandler — see Slogger-Handlers.md#tcp-handler
{
  name: 'tcp',
  type: 'TCPHandler',
  level: SyslogSeverities.INFO,
  host: 'logstash.internal',
  port: 5044,
  framing: 'lf',                       // default: 'lf'; or 'octet-count'
  formatter: 'json',
}

// StreamHandler — see Slogger-Handlers.md#stream-handler
{
  name: 'stream',
  type: 'StreamHandler',
  level: SyslogSeverities.INFO,
  stream: someWritableStream,          // WritableStream<Uint8Array> by default
  useTextMode: false,                  // true for WritableStream<string>
}

// MemoryHandler — see Slogger-Handlers.md#memory-handler
{
  name: 'recent',
  type: 'MemoryHandler',
  level: SyslogSeverities.DEBUG,
  capacity: 500,                       // default: 100 records
}
```

### ConsoleHandler Options

```typescript ignore
{
  name: 'console',
  type: 'ConsoleHandler',
  level: SyslogSeverities.DEBUG,
  useColor: true,                            // Enable colored output (default: false)
  formatter: 'standard',
}
```

### FileHandler Options

```typescript ignore
{
  name: 'file',
  type: 'FileHandler',
  level: SyslogSeverities.INFO,
  directory: './logs/${date}',               // Directory (supports variables)
  filenameTemplate: 'app-${hour}.log',               // File name (supports variables)
  maxFileSizeBytes: 50 * 1024 * 1024,        // Max size in bytes (default: 50 MiB)
  bufferSizeBytes: 4096,                     // Buffer size in bytes (default: 4096)
  formatter: 'json',
}
```

**Supported variables:**

- `${name}` - Handler name
- `${date}` - YYYY-MM-DD
- `${year}` - YYYY
- `${month}` - MM
- `${day}` - DD
- `${hour}` - HH

### HTTPHandler Options

```typescript ignore
{
  name: 'http',
  type: 'HTTPHandler',
  level: SyslogSeverities.WARNING,
  url: 'https://logs.example.com/ingest',    // Endpoint URL
  method: 'POST',                            // 'POST' | 'PUT' — required, no default
  batchSize: 50,                             // Batch size (default: 1)
  maxBufferSize: 10_000,                     // Queue cap, records; drop-oldest (default: 10_000)
  headers: {                                 // Custom headers
    'Authorization': 'Bearer TOKEN',
    'Content-Type': 'application/json'
  },
  formatter: 'json',
}
```

> `method` has no default — omitting it (or passing anything besides
> `'POST'`/`'PUT'`) throws `SloggerConfigError` at construction.
> `batchSize` defaults to `1` (send immediately), not a pre-batched
> value — set it explicitly for actual batching. `maxBufferSize`
> bounds the pending-batch-plus-retry queue so a persistently down
> endpoint drops the oldest records instead of growing memory
> unboundedly; see
> [Handlers → HTTP Handler](../handlers/Slogger-Handlers.md#http-handler)
> for the full option list.

### BlackholeHandler Options

```typescript ignore
{
  name: 'null',
  type: 'BlackholeHandler',
  level: SyslogSeverities.DEBUG,
}
```

## Log Levels

Slogger uses syslog severity levels (RFC 5424).

### Severity Levels

| Level     | Numeric | Name      | Description                 | Use Case                  |
| --------- | ------- | --------- | --------------------------- | ------------------------- |
| EMERGENCY | 0       | emergency | System unusable             | Catastrophic failures     |
| ALERT     | 1       | alert     | Action required immediately | Critical alerts           |
| CRITICAL  | 2       | critical  | Critical conditions         | System component failures |
| ERROR     | 3       | error     | Error conditions            | Application errors        |
| WARNING   | 4       | warning   | Warning conditions          | Deprecated API usage      |
| NOTICE    | 5       | notice    | Normal but significant      | Significant events        |
| INFO      | 6       | info      | Informational messages      | General information       |
| DEBUG     | 7       | debug     | Debug-level messages        | Development debugging     |

### Using Log Levels

```typescript
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;
declare const value: unknown;

logger.emergency('System is unusable'); // Level 0
logger.alert('Immediate action required'); // Level 1
logger.critical('Critical component failed'); // Level 2
logger.error('Operation failed'); // Level 3
logger.warning('Deprecated API used'); // Level 4
logger.notice('Significant event occurred'); // Level 5
logger.info('User logged in'); // Level 6
logger.debug('Variable value: ' + value); // Level 7
```

### Level Filtering

Logs are filtered by comparing numeric levels:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

// Global level: INFO (6)
const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO, // 6
  handlers: [/* ... */],
});

logger.debug('Debug message'); // Filtered out (7 > 6)
logger.info('Info message'); // Logged (6 <= 6)
logger.error('Error message'); // Logged (3 <= 6)
```

### Per-Handler Levels

Each handler can have its own minimum level:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.DEBUG, // Global: DEBUG (7)
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.DEBUG, // Console: DEBUG (7)
    },
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO, // File: INFO (6)
    },
    {
      name: 'http',
      type: 'HTTPHandler',
      level: SyslogSeverities.ERROR, // HTTP: ERROR (3)
    },
  ],
});

// DEBUG logs go to console only
// INFO logs go to console and file
// ERROR logs go to console, file, and HTTP
```

## Sampling Configuration

Reduce log volume by sampling a percentage of logs.

### Global Sampling

Applied to all handlers:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'HighVolume',
  level: SyslogSeverities.DEBUG,
  handlers: [/* ... */],
  sampling: {
    sampleRate: 0.01, // Sample 1%
    bypassSamplingForLevel: SyslogSeverities.ERROR, // Always log errors
  },
});
```

### Per-Handler Sampling

Different sampling rates for each handler:

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.DEBUG,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      // No sampling for console
    },
    {
      name: 'debug-file',
      type: 'FileHandler',
      level: SyslogSeverities.DEBUG,
      sampling: {
        sampleRate: 0.05, // Sample 5% of DEBUG logs
        bypassSamplingForLevel: SyslogSeverities.WARNING, // Always log warnings+
      },
    },
  ],
});
```

### Sampling Options

```typescript
import type { SyslogSeverities } from '@tundralibs/slogger';

interface SamplingOptions {
  sampleRate?: number; // 0.0-1.0 (0.1 = 10%, 1.0 = 100%)
  bypassSamplingForLevel?: SyslogSeverities; // Logs at/above always logged
}
```

## Environment-Based Configuration

Adapt configuration to different environments.

### Development vs Production

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const isDev = Deno.env.get('ENV') === 'development';

const logger = new Slogger({
  appName: isDev ? 'MyApp-Dev' : 'MyApp-Prod',
  level: isDev ? SyslogSeverities.DEBUG : SyslogSeverities.INFO,
  handlers: isDev
    ? [
      {
        name: 'console',
        type: 'ConsoleHandler',
        level: SyslogSeverities.DEBUG,
        useColor: true,
        formatter: 'detailed',
      },
    ]
    : [
      {
        name: 'file',
        type: 'FileHandler',
        level: SyslogSeverities.INFO,
        directory: '/var/log/myapp',
        filenameTemplate: 'app.log',
        maxFileSizeBytes: 100 * 1024 * 1024,
        formatter: 'json',
      },
      {
        name: 'errors',
        type: 'HTTPHandler',
        level: SyslogSeverities.ERROR,
        url: Deno.env.get('LOG_ENDPOINT')!,
        headers: {
          'Authorization': `Bearer ${Deno.env.get('LOG_API_KEY')}`,
        },
        formatter: 'json',
      },
    ],
});
```

### Configuration from Environment

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logLevelMap: Record<string, SyslogSeverities> = {
  'emergency': SyslogSeverities.EMERGENCY,
  'alert': SyslogSeverities.ALERT,
  'critical': SyslogSeverities.CRITICAL,
  'error': SyslogSeverities.ERROR,
  'warning': SyslogSeverities.WARNING,
  'notice': SyslogSeverities.NOTICE,
  'info': SyslogSeverities.INFO,
  'debug': SyslogSeverities.DEBUG,
};

const envLevel = Deno.env.get('LOG_LEVEL') || 'info';
const level = logLevelMap[envLevel] || SyslogSeverities.INFO;

const logger = new Slogger({
  appName: Deno.env.get('APP_NAME') || 'MyApp',
  level,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: 'standard',
  }],
});
```

### Configuration from File

```typescript
import {
  type HandlerConfig,
  Slogger,
  type SyslogSeverities,
} from '@tundralibs/slogger';
import { parse } from 'https://deno.land/std/jsonc/mod.ts';

declare const logLevelMap: Record<string, SyslogSeverities>; // see above

interface LogConfig {
  appName: string;
  level: string;
  handlers: Array<{
    name: string;
    type: string;
    [key: string]: unknown;
  }>;
}

const configText = await Deno.readTextFile('./config/logging.jsonc');
const config = parse(configText) as unknown as LogConfig;

const logger = new Slogger({
  appName: config.appName,
  level: logLevelMap[config.level],
  handlers: config.handlers as HandlerConfig[],
});
```

## Advanced Patterns

### Multiple Environments

```typescript
import {
  Slogger,
  type SloggerOptions,
  SyslogSeverities,
} from '@tundralibs/slogger';

type Environment = 'development' | 'staging' | 'production';

const configs: Record<Environment, SloggerOptions> = {
  development: {
    appName: 'MyApp-Dev',
    level: SyslogSeverities.DEBUG,
    handlers: [{
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'detailed',
      useColor: true,
    }],
  },
  staging: {
    appName: 'MyApp-Staging',
    level: SyslogSeverities.INFO,
    handlers: [
      {
        name: 'console',
        type: 'ConsoleHandler',
        level: SyslogSeverities.INFO,
        formatter: 'standard',
      },
      {
        name: 'file',
        type: 'FileHandler',
        level: SyslogSeverities.INFO,
        directory: './logs',
        filenameTemplate: 'app.log',
        formatter: 'json',
      },
    ],
  },
  production: {
    appName: 'MyApp',
    level: SyslogSeverities.INFO,
    handlers: [
      {
        name: 'file',
        type: 'FileHandler',
        level: SyslogSeverities.INFO,
        directory: '/var/log/myapp',
        filenameTemplate: 'app.log',
        maxFileSizeBytes: 100 * 1024 * 1024,
        formatter: 'json',
      },
      {
        name: 'errors',
        type: 'HTTPHandler',
        level: SyslogSeverities.ERROR,
        url: Deno.env.get('LOG_ENDPOINT')!,
        formatter: 'json',
      },
    ],
  },
};

const env = (Deno.env.get('ENV') as Environment) || 'development';
const logger = new Slogger(configs[env]);
```

### Conditional Handlers

```typescript
import {
  type HandlerConfig,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const handlers: HandlerConfig[] = [
  {
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: 'standard',
  },
];

// Add file handler if log path is configured
const logPath = Deno.env.get('LOG_PATH');
if (logPath) {
  handlers.push({
    name: 'file',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: logPath,
    filenameTemplate: 'app.log',
    formatter: 'json',
  });
}

// Add HTTP handler if endpoint is configured
const logEndpoint = Deno.env.get('LOG_ENDPOINT');
if (logEndpoint) {
  handlers.push({
    name: 'http',
    type: 'HTTPHandler',
    level: SyslogSeverities.ERROR,
    url: logEndpoint,
    formatter: 'json',
  });
}

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers,
});
```

### Dynamic Handler Addition

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

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

// Add handler at runtime
import { FileHandler, jsonFormatter } from '@tundralibs/slogger';

const fileHandler = new FileHandler('runtime-file', {
  level: SyslogSeverities.DEBUG,
  directory: './logs',
  filenameTemplate: 'debug.log',
  formatter: jsonFormatter,
});

logger.registerHandler(fileHandler);
```

## Related Documentation

- [Handlers](../handlers/Slogger-Handlers.md) - Handler details
- [Formatters](../formatters/Slogger-Formatters.md) - Formatter details
- [Examples](Slogger-Examples.md) - Usage examples
- [Performance](Slogger-Performance.md) - Performance tuning

---

[← Back to Slogger](../README.md)
