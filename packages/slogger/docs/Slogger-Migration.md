# Slogger Migration Guide

Migrating to Slogger from other logging libraries.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [From console.log](#from-consolelog)
- [From Winston](#from-winston)
- [From Pino](#from-pino)
- [From Bunyan](#from-bunyan)
- [From Log4js](#from-log4js)
- [From Deno std/log](#from-deno-stdlog)

## From console.log

### Before

```javascript
console.log('Application started');
console.log('User logged in:', userId);
console.error('Database connection failed:', error);
console.warn('Deprecated API used');
```

### After

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

declare const userId: string;
declare const error: Error;

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

logger.info('Application started');
logger.info('User logged in', { userId });
logger.error('Database connection failed', { error: error.message });
logger.warning('Deprecated API used');
```

### Benefits

- Structured context instead of string concatenation
- Log levels for filtering
- Multiple output destinations
- Consistent formatting
- Better performance with lazy evaluation

## From Winston

Winston is a popular Node.js logging library.

### Before (Winston)

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

logger.info('User logged in', { userId: '123' });
logger.error('Operation failed', { error: err.message });
```

### After (Slogger)

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

declare const err: Error;

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'error-file',
      type: 'FileHandler',
      level: SyslogSeverities.ERROR,
      directory: './',
      filenameTemplate: 'error.log',
      formatter: 'json',
    },
    {
      name: 'combined-file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './',
      filenameTemplate: 'combined.log',
      formatter: 'json',
    },
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'standard',
    },
  ],
});

logger.info('User logged in', { userId: '123' });
logger.error('Operation failed', { error: err.message });
```

### Level Mapping

| Winston | Slogger |
| ------- | ------- |
| error   | error   |
| warn    | warning |
| info    | info    |
| http    | notice  |
| verbose | info    |
| debug   | debug   |
| silly   | debug   |

### Format Mapping

| Winston Format         | Slogger Formatter         |
| ---------------------- | ------------------------- |
| `format.json()`        | `'json'`                  |
| `format.simple()`      | `'standard'`              |
| `format.prettyPrint()` | `'detailed'`              |
| Custom                 | Custom formatter function |

## From Pino

Pino is a fast Node.js logger with low overhead.

### Before (Pino)

```javascript
const pino = require('pino');

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      useColor: true,
    },
  },
});

logger.info({ userId: '123' }, 'User logged in');
logger.error({ err }, 'Operation failed');
```

### After (Slogger)

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

declare const err: Error;

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    useColor: true,
    formatter: 'detailed',
  }],
});

logger.info('User logged in', { userId: '123' });
logger.error('Operation failed', { err });
```

### Key Differences

**Message/Context Order:**

- Pino: `logger.info(context, message)`
- Slogger: `logger.info(message, context)`

**Child Loggers:**

```javascript
// Pino
const child = logger.child({ component: 'auth' });

// Slogger equivalent: use context
logger.info('Login attempt', { component: 'auth', userId });
```

## From Bunyan

Bunyan is a JSON logging library for Node.js.

### Before (Bunyan)

```javascript
const bunyan = require('bunyan');

const logger = bunyan.createLogger({
  name: 'myapp',
  streams: [
    {
      level: 'info',
      stream: process.stdout,
    },
    {
      level: 'error',
      path: './logs/error.log',
    },
  ],
});

logger.info('Server started on port %d', port);
logger.error({ err: error }, 'Request failed');
```

### After (Slogger)

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

declare const port: number;
declare const error: Error;

const logger = new Slogger({
  appName: 'myapp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'stdout',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'json',
    },
    {
      name: 'error-file',
      type: 'FileHandler',
      level: SyslogSeverities.ERROR,
      directory: './logs',
      filenameTemplate: 'error.log',
      formatter: 'json',
    },
  ],
});

logger.info('Server started on port', { port });
logger.error('Request failed', { err: error });
```

### Level Mapping

| Bunyan     | Slogger   |
| ---------- | --------- |
| fatal (60) | emergency |
| error (50) | error     |
| warn (40)  | warning   |
| info (30)  | info      |
| debug (20) | debug     |
| trace (10) | debug     |

## From Log4js

Log4js is a logging framework inspired by Log4j.

### Before (Log4js)

```javascript
const log4js = require('log4js');

log4js.configure({
  appenders: {
    file: { type: 'file', filename: 'app.log' },
    console: { type: 'console' },
  },
  categories: {
    default: { appenders: ['file', 'console'], level: 'info' },
  },
});

const logger = log4js.getLogger();
logger.info('Application started');
logger.error('Error occurred', error);
```

### After (Slogger)

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

declare const error: Error;

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './',
      filenameTemplate: 'app.log',
      formatter: 'json',
    },
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'standard',
    },
  ],
});

logger.info('Application started');
logger.error('Error occurred', { error: error.message });
```

### Level Mapping

| Log4js | Slogger   |
| ------ | --------- |
| fatal  | emergency |
| error  | error     |
| warn   | warning   |
| info   | info      |
| debug  | debug     |
| trace  | debug     |

## From Deno std/log

Deno's standard library logging module.

### Before (Deno std/log)

```typescript ignore
import * as log from 'https://deno.land/std/log/mod.ts';

await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler('DEBUG'),
    file: new log.handlers.FileHandler('INFO', {
      filename: './logs/app.log',
      formatter: '{datetime} {levelName} {msg}',
    }),
  },
  loggers: {
    default: {
      level: 'DEBUG',
      handlers: ['console', 'file'],
    },
  },
});

const logger = log.getLogger();
logger.info('Application started');
logger.error('Error occurred', error);
```

### After (Slogger)

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

declare const error: Error;

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.DEBUG,
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

logger.info('Application started');
logger.error('Error occurred', { error: error.message });
```

### Advantages Over std/log

- Better TypeScript support
- Cross-runtime compatibility (Deno, Bun, Node.js)
- Built-in sensitive data masking
- HTTP handler for remote logging
- Sampling support for high-volume logs
- Lazy context evaluation
- Better performance

## Migration Checklist

### 1. Install Slogger

```bash
# Deno
deno add @tundralibs/slogger

# Bun
bunx jsr add @tundralibs/slogger

# Node.js
npx jsr add @tundralibs/slogger
```

### 2. Replace Logger Initialization

Replace your existing logger setup with Slogger configuration.

### 3. Update Log Calls

- Change log method names if needed (e.g., `warn` → `warning`)
- Ensure message is first parameter, context is second
- Use objects for context instead of string concatenation

### 4. Map Log Levels

Refer to level mapping tables above for your previous library.

### 5. Configure Handlers

Map your previous transports/handlers to Slogger handlers:

- Console → ConsoleHandler
- File → FileHandler
- HTTP → HTTPHandler

### 6. Update Formatters

Choose appropriate Slogger formatters or create custom ones:

- JSON → `'json'`
- Simple text → `'standard'`
- Detailed → `'detailed'`

### 7. Test Thoroughly

Verify logs are being written correctly:

- Check all log levels work
- Verify file rotation
- Test error scenarios
- Confirm context serialization

### 8. Consider New Features

Take advantage of Slogger-specific features:

- Data masking for sensitive fields
- Sampling for high-volume logs
- Lazy context evaluation
- Multiple concurrent handlers

## Common Migration Patterns

### Pattern 1: Replace String Interpolation

```typescript
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;
declare const userId: string;
declare const ip: string;

// Before
logger.info(`User ${userId} logged in from ${ip}`);

// After
logger.info('User logged in', { userId, ip });
```

### Pattern 2: Error Logging

```typescript ignore
// Before
logger.error('Failed:', error);

// After
logger.error('Failed', {
  error: error.message,
  stack: error.stack,
  code: error.code,
});
```

### Pattern 3: Child Loggers

```typescript ignore
// Before (Winston/Pino child loggers)
const childLogger = logger.child({ component: 'auth' });
childLogger.info('Login attempt');

// After (context-based)
logger.info('Login attempt', { component: 'auth' });

// Or create separate logger instance
const authLogger = new Slogger({
  appName: 'MyApp-Auth',
  // ... same handlers
});
```

### Pattern 4: Custom Formatters

```typescript ignore
// Before (Winston)
const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

// After (Slogger)
import type { SlogObject } from '@tundralibs/slogger';

function customFormatter(log: SlogObject): string {
  return `${log.isoDate} ${log.levelName}: ${log.message}`;
}

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: customFormatter,
  }],
});
```

## Troubleshooting

### Issue: Missing logs

**Solution:** Check log level configuration. Slogger uses syslog levels (0-7), lower is more severe.

```typescript ignore
// Set to DEBUG to see all logs
level: SyslogSeverities.DEBUG;
```

### Issue: Context not logged

**Solution:** Ensure context is an object, not concatenated to message.

```typescript
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;
declare const userId: string;

// ❌ Wrong
logger.info('User: ' + userId);

// ✅ Correct
logger.info('User action', { userId });
```

### Issue: File not created

**Solution:** Check file permissions and ensure directory exists.

```typescript ignore
// Slogger creates directories automatically, but check permissions
{
  directory: './logs', // Must have write permission
  filenameTemplate: 'app.log'
}
```

### Issue: Performance degradation

**Solution:** Use lazy context evaluation and appropriate log levels.

```typescript ignore
// Use lazy context for expensive operations
logger.debug('Expensive data', () => ({
  data: expensiveCalculation(),
}));

// Raise log level in production
level: isProduction ? SyslogSeverities.INFO : SyslogSeverities.DEBUG;
```

## Related Documentation

- [Configuration](Slogger-Configuration.md) - Complete configuration guide
- [Examples](Slogger-Examples.md) - Usage examples
- [Handlers](../handlers/Slogger-Handlers.md) - Handler details
- [Formatters](../formatters/Slogger-Formatters.md) - Formatter details

---

[← Back to Slogger](../README.md)
