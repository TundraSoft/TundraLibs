# Slogger - High-Performance Structured Logging for Deno

[![Deno](https://img.shields.io/badge/deno-v2.0%2B-green.svg)](https://deno.land/)
[![Coverage](https://img.shields.io/badge/coverage-92.1%25-brightgreen.svg)](https://github.com/TundraSoft/TundraLibs/tree/main/slogger)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Slogger is a high-performance, flexible structured logging library for Deno applications. It provides a comprehensive logging solution with multiple formatters, handlers, and advanced features like sampling, masking, and binary serialization.

## 🚀 Features

- **High Performance**: Lazy context evaluation and pre-filtering optimization
- **Multiple Handlers**: Console, File (with rotation), HTTP, and Blackhole
- **Rich Formatters**: JSON, String variants, Masking, and Binary for high-throughput
- **Security**: Built-in sensitive data masking
- **Sampling**: Configurable log sampling for high-volume scenarios
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Zero Dependencies**: Uses only Deno standard library
- **Flexible Configuration**: Simple and advanced configuration options

## 📦 Installation

```typescript
import { Slogger } from 'https://deno.land/x/tundralibs@v1.0.0/slogger/mod.ts';
```

Or add to your `deno.json`:

```json
{
  "imports": {
    "@tundralibs/slogger": "https://deno.land/x/tundralibs@v1.0.0/slogger/mod.ts"
  }
}
```

## 🎯 Quick Start

### Basic Usage

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'console',
      formatter: 'standard',
    },
  ],
});

logger.info('Application started', { port: 3000, env: 'production' });
logger.error('Database connection failed', { host: 'localhost', port: 5432 });
```

### Advanced Configuration

```typescript
import {
  Slogger,
  streamingBinaryFormatter,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'HighVolumeApp',
  level: SyslogSeverities.DEBUG,
  handlers: [
    {
      name: 'file',
      type: 'file',
      level: SyslogSeverities.INFO,
      storePath: './logs',
      fileName: 'app.log',
      maxFileSize: 100, // MB
      bufferSize: 8192,
      formatter: 'json',
    },
    {
      name: 'http',
      type: 'http',
      level: SyslogSeverities.ERROR,
      url: 'https://logs.example.com/ingest',
      batchSize: 100,
      formatter: streamingBinaryFormatter,
    },
  ],
  sampling: {
    sampleRate: 0.1, // Sample 10% of logs
    bypassLevel: SyslogSeverities.ERROR, // Always log errors
  },
});
```

## 📊 Performance Characteristics

### Throughput Benchmarks

| Operation               | Ops/sec | Notes                      |
| ----------------------- | ------- | -------------------------- |
| Console logging         | 50,000+ | With string formatter      |
| File logging (buffered) | 35,000+ | 4KB buffer, async writes   |
| JSON formatting         | 40,000+ | Standard JSON formatter    |
| Binary formatting       | 75,000+ | Compact binary format      |
| Lazy context evaluation | 80,000+ | When logs are filtered out |

### Memory Usage

- **Base overhead**: ~2KB per logger instance
- **Handler overhead**: ~1KB per handler
- **Buffer pooling**: Binary formatters use pooled buffers
- **Context caching**: Automatic context memoization

### Latency Characteristics

- **P50**: <0.1ms for console/file handlers
- **P95**: <0.5ms for HTTP handlers (batched)
- **P99**: <2ms for file rotation operations

## 🎨 Formatters

### String Formatters

```typescript
import {
  compactFormat,
  detailedFormat,
  standardFormat,
} from '@tundralibs/slogger';

// Standard format: [2024-01-15T10:30:00.000Z] INFO MyApp: User logged in
logger.info('User logged in', { userId: '123' });

// Detailed format with context
const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'console',
    formatter: detailedFormat,
  }],
});
```

### JSON Formatter

```typescript
import { jsonFormatter } from "@tundralibs/slogger";

// Outputs structured JSON
{
  "id": "01HKQR2TPXXXXXXXXXXXXXXX",
  "appName": "MyApp",
  "hostname": "my-server",
  "level": 6,
  "levelName": "INFO",
  "message": "User logged in",
  "context": { "userId": "123" },
  "timestamp": 1705312200000,
  "isoDate": "2024-01-15T10:30:00.000Z"
}
```

### Masking Formatter

```typescript
import { maskingFormatter, MaskingStrategy } from '@tundralibs/slogger';

const maskedLogger = new Slogger({
  appName: 'SecureApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'console',
    formatter: maskingFormatter({
      strategy: MaskingStrategy.PARTIAL,
      maskChar: '*',
      sensitiveFields: ['password', 'apiKey', 'token'],
      customPatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email regex
      ],
    }),
  }],
});

logger.info('User authenticated', {
  email: 'user@example.com',
  apiKey: 'secret123',
});
// Output: User authenticated {"email":"u***@example.com","apiKey":"***"}
```

### Binary Formatter (High-Throughput)

```typescript
import {
  binaryFormatter,
  compactBinaryFormatter,
  streamingBinaryFormatter,
} from '@tundralibs/slogger';

// For maximum performance
const highThroughputLogger = new Slogger({
  appName: 'HighVolumeApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'binary-file',
    type: 'file',
    storePath: './logs',
    fileName: 'app.bin',
    formatter: streamingBinaryFormatter, // 30-50% smaller than JSON
  }],
});
```

## 🎛️ Handlers

### Console Handler

```typescript
{
  name: "console",
  type: "console",
  level: SyslogSeverities.DEBUG,
  colorize: true, // Enable colors (default: true)
  formatter: "standard"
}
```

### File Handler

```typescript
{
  name: "app-logs",
  type: "file",
  level: SyslogSeverities.INFO,
  storePath: "./logs/${date}", // Variables supported
  fileName: "app-${hour}.log",
  maxFileSize: 50, // MB (default: 50)
  bufferSize: 4096, // bytes (default: 4096)
  formatter: "json"
}
```

**File Handler Variables:**

- `${name}` - Handler name
- `${date}` - Current date (YYYY-MM-DD)
- `${day}`, `${month}`, `${year}` - Date components
- `${hour}` - Current hour (HH)

### HTTP Handler

```typescript
{
  name: "remote-logs",
  type: "http",
  level: SyslogSeverities.WARNING,
  url: "https://logs.example.com/api/ingest",
  method: "POST", // default: POST
  batchSize: 50, // default: 10
  headers: {
    "Authorization": "Bearer YOUR_TOKEN",
    "Content-Type": "application/json"
  },
  formatter: "json"
}
```

### Blackhole Handler

```typescript
// Useful for testing or disabling logging
{
  name: "null",
  type: "blackhole",
  level: SyslogSeverities.DEBUG
}
```

## 🎯 Advanced Features

### Lazy Context Evaluation

```typescript
// Context function is only called if log level permits
logger.debug('Expensive operation', () => ({
  result: performExpensiveCalculation(),
  metadata: gatherSystemInfo(),
}));

// Context is never evaluated if DEBUG level is disabled
```

### Sampling Configuration

```typescript
const logger = new Slogger({
  appName: "HighVolumeApp",
  level: SyslogSeverities.DEBUG,
  handlers: [/* ... */],
  sampling: {
    sampleRate: 0.01, // Sample 1% of logs
    bypassLevel: SyslogSeverities.ERROR // Always log errors and above
  }
});

// Or per-handler sampling
{
  name: "debug-handler",
  type: "file",
  sampling: {
    sampleRate: 0.05 // Sample 5% for this handler
  }
}
```

### Custom Formatters

```typescript
import type { SlogObject } from '@tundralibs/slogger';

function customFormatter(log: SlogObject): string {
  return `${log.timestamp}|${log.level}|${log.appName}|${log.message}`;
}

const logger = new Slogger({
  appName: 'CustomApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'custom',
    type: 'console',
    formatter: customFormatter,
  }],
});
```

### Error Handling and Resilience

```typescript
// File handler automatically falls back to console on errors
logger.error('This will be logged even if file writing fails');

// HTTP handler batches and retries
// Failed batches are logged to console as fallback
```

## 🔄 Migration Guide

### From Console.log

```typescript
// Before
console.log('User logged in:', userId);
console.error('Database error:', error);

// After
const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{ name: 'console', type: 'console', formatter: 'standard' }],
});

logger.info('User logged in', { userId });
logger.error('Database error', { error: error.message, stack: error.stack });
```

### From Winston

```typescript
// Before (Winston)
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'app.log' }),
    new winston.transports.Console(),
  ],
});

// After (Slogger)
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'file',
      type: 'file',
      storePath: './',
      fileName: 'app.log',
      formatter: 'json',
    },
    {
      name: 'console',
      type: 'console',
      formatter: 'standard',
    },
  ],
});
```

### From Pino

```typescript
// Before (Pino)
const pino = require('pino');
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
  },
});

// After (Slogger)
const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'console',
    formatter: 'detailed', // Similar to pino-pretty
  }],
});
```

## 🛠️ Best Practices

### Performance Optimization

```typescript
// 1. Use appropriate log levels
const logger = new Slogger({
  appName: "ProdApp",
  level: SyslogSeverities.INFO, // Don't log DEBUG in production
  handlers: [/* ... */]
});

// 2. Use lazy context evaluation for expensive operations
logger.debug("Complex calculation", () => ({
  result: heavyComputation() // Only called if DEBUG is enabled
}));

// 3. Use sampling for high-volume logs
logger.debug("Request processed", { requestId }); // Subject to sampling

// 4. Use binary formatters for high-throughput scenarios
{
  name: "high-volume",
  type: "file",
  formatter: streamingBinaryFormatter
}
```

### Security

```typescript
// Always mask sensitive data
import { maskingFormatter } from '@tundralibs/slogger';

const secureLogger = new Slogger({
  appName: 'SecureApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'secure-file',
    type: 'file',
    storePath: './secure-logs',
    fileName: 'app.log',
    formatter: maskingFormatter({
      sensitiveFields: [
        'password',
        'token',
        'apiKey',
        'secret',
        'creditCard',
        'ssn',
        'email',
      ],
    }),
  }],
});
```

### Structured Logging

```typescript
// Good: Structured context
logger.info('User action', {
  userId: '123',
  action: 'login',
  ip: '192.168.1.1',
  userAgent: req.headers['user-agent'],
});

// Avoid: String interpolation
logger.info(`User ${userId} performed ${action}`); // Less searchable
```

### Error Logging

```typescript
// Comprehensive error logging
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    context: {
      operation: 'riskyOperation',
      timestamp: Date.now(),
      input: sanitizedInput,
    },
  });
}
```

## 🧪 Testing

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

// Use blackhole handler for tests
const testLogger = new Slogger({
  appName: 'TestApp',
  level: SyslogSeverities.ERROR, // Only log errors in tests
  handlers: [{
    name: 'test',
    type: 'blackhole', // No output during tests
  }],
});

// Or capture logs for assertions
const logs: string[] = [];
const captureLogger = new Slogger({
  appName: 'TestApp',
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: 'capture',
    type: 'console',
    formatter: (log) => {
      const formatted = JSON.stringify(log);
      logs.push(formatted);
      return formatted;
    },
  }],
});
```

## 📈 Monitoring and Observability

### Integration with Monitoring Systems

```typescript
// Datadog
{
  name: "datadog",
  type: "http",
  url: "https://http-intake.logs.datadoghq.com/v1/input/YOUR_API_KEY",
  headers: {
    "Content-Type": "application/json"
  },
  formatter: "json"
}

// Elasticsearch
{
  name: "elasticsearch",
  type: "http", 
  url: "https://your-es-cluster.com/_bulk",
  headers: {
    "Authorization": "Basic " + btoa("username:password"),
    "Content-Type": "application/x-ndjson"
  },
  formatter: customElasticsearchFormatter
}

// Grafana Loki
{
  name: "loki",
  type: "http",
  url: "https://your-loki.com/loki/api/v1/push",
  formatter: customLokiFormatter
}
```

### Metrics and Health Checks

```typescript
// Log metrics for monitoring
logger.info('Request processed', {
  method: 'GET',
  path: '/api/users',
  statusCode: 200,
  responseTime: 45,
  userAgent: 'Mozilla/5.0...',
});

// Application health
logger.info('Health check', {
  status: 'healthy',
  uptime: process.uptime(),
  memoryUsage: process.memoryUsage(),
  cpuUsage: process.cpuUsage(),
});
```

## 🚨 Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```typescript
   // Solution: Reduce buffer sizes or enable sampling
   {
     name: "file",
     type: "file",
     bufferSize: 1024, // Smaller buffer
     sampling: { sampleRate: 0.1 }
   }
   ```

2. **File Handler Permissions**
   ```bash
   # Ensure write permissions
   chmod 755 ./logs

   # Or use a different directory
   storePath: "/tmp/mylogs"
   ```

3. **HTTP Handler Timeouts**
   ```typescript
   // Add retry logic or use batching
   {
     name: "http",
     type: "http",
     batchSize: 100, // Larger batches
     timeout: 5000 // Custom timeout
   }
   ```

### Debug Mode

```typescript
// Enable debug logging to troubleshoot
const debugLogger = new Slogger({
  appName: 'DebugApp',
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: 'debug-console',
    type: 'console',
    formatter: 'detailed',
  }],
});
```

## 📚 API Reference

### Slogger Class

```typescript
class Slogger {
  constructor(options: SloggerOptions);

  // Log methods
  emergency(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;
  alert(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;
  critical(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;
  error(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;
  warning(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;
  notice(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;
  info(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;
  debug(
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): void;

  // Core method
  log(
    level: SyslogSeverities,
    message: string,
    context?: Record<string, unknown> | (() => Record<string, unknown>),
  ): Promise<void>;

  // Handler management
  registerHandler(handler: AbstractHandler): void;
}
```

### SyslogSeverities Enum

```typescript
enum SyslogSeverities {
  EMERGENCY = 0, // System is unusable
  ALERT = 1, // Action must be taken immediately
  CRITICAL = 2, // Critical conditions
  ERROR = 3, // Error conditions
  WARNING = 4, // Warning conditions
  NOTICE = 5, // Normal but significant condition
  INFO = 6, // Informational messages
  DEBUG = 7, // Debug-level messages
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/TundraSoft/TundraLibs.git
cd TundraLibs/slogger
deno task test
deno task bench
```

### Running Tests

```bash
# Run all tests
deno task test

# Run with coverage
deno task test:coverage

# Run benchmarks
deno task bench
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Winston, Pino, and other excellent logging libraries
- Built for the Deno ecosystem with performance in mind
- Thanks to all contributors and the Deno community

---

**Made with ❤️ by TundraSoft**

For more information, visit our [documentation](https://docs.tundrasoft.com/slogger) or [GitHub repository](https://github.com/TundraSoft/TundraLibs).
