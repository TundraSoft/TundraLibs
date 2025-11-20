# Slogger

A high-performance, flexible structured logging library for Deno applications.
Provides comprehensive logging with multiple formatters, handlers, and advanced
features like sampling, masking, and performance optimization.

## Installation & Quick Start

```bash
# Deno
import { Slogger } from 'jsr:@tundralibs/slogger';

# Node.js (via JSR)
npx jsr add @tundralibs/slogger
```

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

// Basic usage
const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    formatter: 'standard',
  }],
});

logger.info('Application started', { port: 3000, env: 'production' });
logger.error('Database connection failed', { host: 'localhost', port: 5432 });

// Advanced configuration with multiple handlers
const advancedLogger = new Slogger({
  appName: 'HighVolumeApp',
  level: SyslogSeverities.DEBUG,
  handlers: [
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      storePath: './logs',
      fileName: 'app.log',
      maxFileSize: 100, // MB
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
    bypassLevel: SyslogSeverities.ERROR, // Always log errors
  },
});
```

## Features

### 🚀 **High Performance**

Optimized for high-throughput logging scenarios:

- **Lazy context evaluation**: Context functions only called when needed
- **Pre-filtering optimization**: Logs filtered before expensive operations
- **Buffer pooling**: Reusable buffers for binary formatters
- **Sampling support**: Configurable log sampling for volume control

### 🎛️ **Multiple Handlers**

Built-in handlers for various output destinations:

- **Console**: Colorized console output with customizable formatting
- **File**: Buffered file writing with automatic rotation
- **HTTP**: Batched HTTP endpoint delivery with retry logic
- **Blackhole**: No-op handler for testing and performance benchmarks

### 🎨 **Rich Formatters**

Comprehensive formatting options:

- **JSON**: Structured JSON output for machine processing
- **String variants**: Human-readable formats (standard, detailed, compact)
- **Masking**: Automatic sensitive data redaction
- **Custom**: Extensible formatter system for specialized needs

### 🛡️ **Security & Safety**

- **Data masking**: Built-in sensitive field detection and redaction
- **Type safety**: Full TypeScript support with comprehensive definitions
- **Error handling**: Graceful degradation and error recovery
- **Validation**: Comprehensive input validation and sanitization

### 📊 **Advanced Schema Composition**

- **Handler chaining**: Multiple output destinations with different configurations
- **Level filtering**: Per-handler and global log level management
- **Context enrichment**: Automatic context injection and variable replacement
- **Performance tuning**: Configurable buffering, batching, and sampling

### 📝 **Developer Experience**

- **Full TypeScript support**: Complete type inference and safety
- **Comprehensive testing**: 82.6% branch coverage with extensive test suite
- **Zero dependencies**: Uses only Deno standard library
- **Flexible configuration**: Simple defaults with advanced customization options

## API Reference

### Core Classes

#### `Slogger`

Main logging class with fluent API for structured logging.

```typescript
const logger = new Slogger(options: SloggerOptions);

// Log methods for all severity levels
logger.emergency(message: string, context?: SlogObject | (() => SlogObject));
logger.alert(message: string, context?: SlogObject | (() => SlogObject));
logger.critical(message: string, context?: SlogObject | (() => SlogObject));
logger.error(message: string, context?: SlogObject | (() => SlogObject));
logger.warning(message: string, context?: SlogObject | (() => SlogObject));
logger.notice(message: string, context?: SlogObject | (() => SlogObject));
logger.info(message: string, context?: SlogObject | (() => SlogObject));
logger.debug(message: string, context?: SlogObject | (() => SlogObject));

// Utility methods
logger.addHandler(handler: AbstractHandler): void;
logger.finalize(): Promise<void>;
```

#### `LogManager`

Singleton for managing handlers and formatters globally.

```typescript
import { LogManager } from '@tundralibs/slogger';

// Register custom handlers and formatters
LogManager.addHandler('custom', CustomHandlerClass);
LogManager.addFormatter('custom', customFormatterFunction);

// Create loggers with registered components
const logger = LogManager.createLogger('MyApp', options);
```

### Configuration Types

#### `SloggerOptions`

```typescript
interface SloggerOptions {
  appName: string;
  level: SyslogSeverity;
  handlers: HandlerConfig[];
  sampling?: {
    sampleRate: number;
    bypassLevel?: SyslogSeverity;
  };
}
```

#### `HandlerConfig`

```typescript
interface HandlerConfig {
  name: string;
  type: 'ConsoleHandler' | 'FileHandler' | 'HTTPHandler' | 'BlackholeHandler';
  level?: SyslogSeverity;
  formatter?: string | SloggerFormatter;
  sampling?: {
    sampleRate: number;
    bypassLevel?: SyslogSeverity;
  };
  // Handler-specific options
  [key: string]: unknown;
}
```

### Handlers

#### `ConsoleHandler`

```typescript
{
  name: 'console',
  type: 'ConsoleHandler',
  level: SyslogSeverities.DEBUG,
  colorize: true, // Enable colors (default: true)
  formatter: 'standard'
}
```

#### `FileHandler`

```typescript
{
  name: 'file',
  type: 'FileHandler',
  level: SyslogSeverities.INFO,
  storePath: './logs/${date}', // Variables supported
  fileName: 'app-${hour}.log',
  maxFileSize: 50, // MB (default: 50)
  bufferSize: 4096, // bytes (default: 4096)
  formatter: 'json'
}
```

#### `HTTPHandler`

```typescript
{
  name: 'remote',
  type: 'HTTPHandler',
  level: SyslogSeverities.WARNING,
  url: 'https://logs.example.com/api/ingest',
  method: 'POST', // default: POST
  batchSize: 50, // default: 10
  headers: {
    'Authorization': 'Bearer TOKEN',
    'Content-Type': 'application/json'
  },
  formatter: 'json'
}
```

### Formatters

#### Built-in String Formatters

```typescript
// Standard: [2024-01-15T10:30:00.000Z] INFO MyApp: Message
'standard'

// Detailed: [2024-01-15T10:30:00.000Z] INFO MyApp (hostname): Message {context}
'detailed'

// Compact: INFO: Message
'compact'

// Minimalist: Message
'minimalist'

// Key-Value: level=INFO app=MyApp message="Message" key=value
'keyValue'
```

#### JSON Formatter

```typescript
'json' // Outputs structured JSON objects
```

#### Masking Formatter

```typescript
import { maskingFormatter, MaskingStrategy } from '@tundralibs/slogger';

maskingFormatter({
  strategy: MaskingStrategy.PARTIAL, // FULL, PARTIAL
  maskChar: '*',
  sensitiveFields: ['password', 'apiKey', 'token'],
  customPatterns: [/\b[\w.-]+@[\w.-]+\.\w+\b/g], // Email regex
  baseFormatter: 'json' // Base formatter to apply masking to
})
```

## Performance Characteristics

### Throughput Benchmarks

| Operation               | Ops/sec | Notes                      |
| ----------------------- | ------- | -------------------------- |
| Console logging         | 50,000+ | With string formatter      |
| File logging (buffered) | 35,000+ | 4KB buffer, async writes   |
| JSON formatting         | 40,000+ | Standard JSON formatter    |
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
} from "@tundralibs/slogger";

// Standard format: [2024-01-15T10:30:00.000Z] INFO MyApp: User logged in
logger.info("User logged in", { userId: "123" });

// Detailed format with context
const logger = new Slogger({
  appName: "MyApp",
  level: SyslogSeverities.INFO,
  handlers: [{
    name: "console",
    type: "console",
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
import { maskingFormatter, MaskingStrategy } from "@tundralibs/slogger";

const maskedLogger = new Slogger({
  appName: "SecureApp",
  level: SyslogSeverities.INFO,
  handlers: [{
    name: "console",
    type: "console",
    formatter: maskingFormatter({
      strategy: MaskingStrategy.PARTIAL,
      maskChar: "*",
      sensitiveFields: ["password", "apiKey", "token"],
      customPatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email regex
      ],
    }),
  }],
});

logger.info("User authenticated", {
  email: "user@example.com",
  apiKey: "secret123",
});
// Output: User authenticated {"email":"u***@example.com","apiKey":"***"}
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
logger.debug("Expensive operation", () => ({
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
import type { SlogObject } from "@tundralibs/slogger";

function customFormatter(log: SlogObject): string {
  return `${log.timestamp}|${log.level}|${log.appName}|${log.message}`;
}

const logger = new Slogger({
  appName: "CustomApp",
  level: SyslogSeverities.INFO,
  handlers: [{
    name: "custom",
    type: "console",
    formatter: customFormatter,
  }],
});
```

### Error Handling and Resilience

```typescript
// File handler automatically falls back to console on errors
logger.error("This will be logged even if file writing fails");

// HTTP handler batches and retries
// Failed batches are logged to console as fallback
```

## 🔄 Migration Guide

### From Console.log

```typescript
// Before
console.log("User logged in:", userId);
console.error("Database error:", error);

// After
const logger = new Slogger({
  appName: "MyApp",
  level: SyslogSeverities.INFO,
  handlers: [{ name: "console", type: "console", formatter: "standard" }],
});

logger.info("User logged in", { userId });
logger.error("Database error", { error: error.message, stack: error.stack });
```

### From Winston

```typescript
// Before (Winston)
const winston = require("winston");
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "app.log" }),
    new winston.transports.Console(),
  ],
});

// After (Slogger)
import { Slogger, SyslogSeverities } from "@tundralibs/slogger";

const logger = new Slogger({
  appName: "MyApp",
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: "file",
      type: "file",
      storePath: "./",
      fileName: "app.log",
      formatter: "json",
    },
    {
      name: "console",
      type: "console",
      formatter: "standard",
    },
  ],
});
```

### From Pino

```typescript
// Before (Pino)
const pino = require("pino");
const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
  },
});

// After (Slogger)
const logger = new Slogger({
  appName: "MyApp",
  level: SyslogSeverities.INFO,
  handlers: [{
    name: "console",
    type: "console",
    formatter: "detailed", // Similar to pino-pretty
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
import { maskingFormatter } from "@tundralibs/slogger";

const secureLogger = new Slogger({
  appName: "SecureApp",
  level: SyslogSeverities.INFO,
  handlers: [{
    name: "secure-file",
    type: "file",
    storePath: "./secure-logs",
    fileName: "app.log",
    formatter: maskingFormatter({
      sensitiveFields: [
        "password",
        "token",
        "apiKey",
        "secret",
        "creditCard",
        "ssn",
        "email",
      ],
    }),
  }],
});
```

### Structured Logging

```typescript
// Good: Structured context
logger.info("User action", {
  userId: "123",
  action: "login",
  ip: "192.168.1.1",
  userAgent: req.headers["user-agent"],
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
  logger.error("Operation failed", {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    context: {
      operation: "riskyOperation",
      timestamp: Date.now(),
      input: sanitizedInput,
    },
  });
}
```

## 🧪 Testing

```typescript
import { Slogger, SyslogSeverities } from "@tundralibs/slogger";

// Use blackhole handler for tests
const testLogger = new Slogger({
  appName: "TestApp",
  level: SyslogSeverities.ERROR, // Only log errors in tests
  handlers: [{
    name: "test",
    type: "blackhole", // No output during tests
  }],
});

// Or capture logs for assertions
const logs: string[] = [];
const captureLogger = new Slogger({
  appName: "TestApp",
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: "capture",
    type: "console",
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
logger.info("Request processed", {
  method: "GET",
  path: "/api/users",
  statusCode: 200,
  responseTime: 45,
  userAgent: "Mozilla/5.0...",
});

// Application health
logger.info("Health check", {
  status: "healthy",
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
  appName: "DebugApp",
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: "debug-console",
    type: "console",
    formatter: "detailed",
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

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md)
for details.

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

For more information, visit our
[documentation](https://docs.tundrasoft.com/slogger) or
[GitHub repository](https://github.com/TundraSoft/TundraLibs).
