# Slogger Examples

Common usage patterns and real-world examples.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Basic Examples](#basic-examples)
- [Web Application](#web-application)
- [API Server](#api-server)
- [Microservice](#microservice)
- [CLI Application](#cli-application)
- [Testing](#testing)
- [Monitoring Integration](#monitoring-integration)

## Basic Examples

### Simple Console Logging

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'SimpleApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: 'standard',
  }],
});

logger.info('Application started');
logger.debug('Debug message'); // Won't be logged (below INFO)
logger.error('Something went wrong', { error: 'connection timeout' });
```

### File Logging

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'FileApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'file',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'app.log',
    maxFileSizeBytes: 50 * 1024 * 1024,
    formatter: 'json',
  }],
});

logger.info('User logged in', { userId: '12345', ip: '192.168.1.1' });
```

### Multiple Handlers

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MultiApp',
  level: SyslogSeverities.DEBUG,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.DEBUG,
      formatter: 'detailed',
    },
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'app.log',
      formatter: 'json',
    },
    {
      name: 'errors',
      type: 'FileHandler',
      level: SyslogSeverities.ERROR,
      directory: './logs',
      filenameTemplate: 'errors.log',
      formatter: 'detailed',
    },
  ],
});
```

## Web Application

### HTTP Server with Request Logging

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';
import { serve } from 'https://deno.land/std/http/server.ts';

const logger = new Slogger({
  appName: 'WebApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'standard',
    },
    {
      name: 'requests',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'requests-${date}.log',
      formatter: 'json',
    },
  ],
});

serve(async (request) => {
  const start = performance.now();
  const url = new URL(request.url);

  try {
    // Log incoming request
    logger.info('Request received', {
      method: request.method,
      path: url.pathname,
      userAgent: request.headers.get('user-agent'),
    });

    // Handle request (example)
    const response = new Response('Hello World');

    // Log response
    const duration = performance.now() - start;
    logger.info('Request completed', {
      method: request.method,
      path: url.pathname,
      status: response.status,
      duration: Math.round(duration),
    });

    return response;
  } catch (error) {
    // Log error
    logger.error('Request failed', {
      method: request.method,
      path: url.pathname,
      error: error.message,
      stack: error.stack,
    });

    return new Response('Internal Server Error', { status: 500 });
  }
}, { port: 8000 });

logger.info('Server started', { port: 8000 });
```

### Middleware Logging

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'API',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'file',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'api-${date}.log',
    formatter: 'json',
  }],
});

function loggingMiddleware(handler: Handler): Handler {
  return async (request: Request) => {
    const requestId = crypto.randomUUID();
    const start = performance.now();

    logger.info('Request started', {
      requestId,
      method: request.method,
      url: request.url,
    });

    try {
      const response = await handler(request);
      const duration = performance.now() - start;

      logger.info('Request completed', {
        requestId,
        status: response.status,
        duration: Math.round(duration),
      });

      return response;
    } catch (error) {
      const duration = performance.now() - start;

      logger.error('Request failed', {
        requestId,
        error: error.message,
        duration: Math.round(duration),
      });

      throw error;
    }
  };
}
```

## API Server

### REST API with Structured Logging

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'RestAPI',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.DEBUG,
      formatter: 'detailed',
    },
    {
      name: 'requests',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'requests.log',
      formatter: 'json',
    },
    {
      name: 'errors',
      type: 'HTTPHandler',
      level: SyslogSeverities.ERROR,
      url: 'https://logs.example.com/api/errors',
      batchSize: 10,
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOG_API_KEY')}`,
      },
      formatter: 'json',
    },
  ],
});

// API endpoint example
async function handleUser(userId: string) {
  logger.debug('Fetching user', { userId });

  try {
    const user = await fetchUserFromDatabase(userId);

    if (!user) {
      logger.warning('User not found', { userId });
      return new Response('Not Found', { status: 404 });
    }

    logger.info('User fetched successfully', {
      userId,
      username: user.username,
    });

    return new Response(JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to fetch user', {
      userId,
      error: error.message,
      stack: error.stack,
    });

    return new Response('Internal Server Error', { status: 500 });
  }
}
```

### Database Query Logging

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'Database',
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: 'queries',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'queries-${date}.log',
    formatter: 'json',
    sampling: {
      sampleRate: 0.1, // Sample 10% of queries
      bypassSamplingForLevel: SyslogSeverities.WARNING,
    },
  }],
});

async function executeQuery(sql: string, params?: unknown[]) {
  const queryId = crypto.randomUUID();
  const start = performance.now();

  logger.debug('Query started', () => ({
    queryId,
    sql,
    params,
  }));

  try {
    const result = await db.query(sql, params);
    const duration = performance.now() - start;

    logger.debug('Query completed', {
      queryId,
      duration: Math.round(duration),
      rowCount: result.length,
    });

    // Log slow queries
    if (duration > 1000) {
      logger.warning('Slow query detected', () => ({
        queryId,
        sql,
        params,
        duration: Math.round(duration),
      }));
    }

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    logger.error('Query failed', {
      queryId,
      sql,
      error: error.message,
      duration: Math.round(duration),
    });

    throw error;
  }
}
```

## Microservice

### Microservice with Distributed Tracing

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'PaymentService',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'standard',
    },
    {
      name: 'distributed',
      type: 'HTTPHandler',
      level: SyslogSeverities.INFO,
      url: 'https://jaeger.example.com/api/logs',
      batchSize: 50,
      formatter: 'json',
    },
  ],
});

async function processPayment(
  paymentId: string,
  traceId: string,
  spanId: string,
) {
  logger.info('Payment processing started', {
    paymentId,
    traceId,
    spanId,
    service: 'PaymentService',
  });

  try {
    // Validate payment
    logger.debug('Validating payment', { paymentId, traceId, spanId });
    await validatePayment(paymentId);

    // Process with external gateway
    logger.info('Calling payment gateway', {
      paymentId,
      traceId,
      spanId,
      gateway: 'Stripe',
    });
    const result = await callPaymentGateway(paymentId);

    // Log success
    logger.info('Payment processed successfully', {
      paymentId,
      traceId,
      spanId,
      result: result.status,
      transactionId: result.id,
    });

    return result;
  } catch (error) {
    logger.error('Payment processing failed', {
      paymentId,
      traceId,
      spanId,
      error: error.message,
      errorCode: error.code,
    });

    throw error;
  }
}
```

## CLI Application

### Interactive CLI with Progress Logging

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'CLI-Tool',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'minimalist', // Clean output for CLI
    },
    {
      name: 'debug-file',
      type: 'FileHandler',
      level: SyslogSeverities.DEBUG,
      directory: './logs',
      filenameTemplate: 'cli-debug.log',
      formatter: 'detailed',
    },
  ],
});

async function processFiles(files: string[]) {
  logger.info(`Processing ${files.length} files...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    logger.debug(`Processing file ${i + 1}/${files.length}`, { file });

    try {
      await processFile(file);
      logger.info(`✓ Processed ${file}`);
    } catch (error) {
      logger.error(`✗ Failed to process ${file}`, {
        file,
        error: error.message,
      });
    }
  }

  logger.info('Processing complete');
}
```

## Testing

### Test Environment Logger

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

// Create logger that doesn't output during tests
export function createTestLogger(appName: string = 'TestApp') {
  return new Slogger({
    appName,
    level: SyslogSeverities.ERROR, // Only errors
    handlers: [{
      name: 'blackhole',
      type: 'BlackholeHandler',
      level: SyslogSeverities.INFO,
    }],
  });
}

// Or capture logs for assertions
export function createCapturingLogger(appName: string = 'TestApp') {
  const logs: string[] = [];

  const logger = new Slogger({
    appName,
    level: SyslogSeverities.DEBUG,
    handlers: [{
      name: 'capture',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: (log) => {
        const formatted = JSON.stringify(log);
        logs.push(formatted);
        return formatted;
      },
    }],
  });

  return { logger, logs };
}

// Use in tests
Deno.test('should log errors', () => {
  const { logger, logs } = createCapturingLogger();

  logger.error('Test error', { code: 500 });

  assert(logs.length === 1);
  assert(logs[0].includes('Test error'));
  assert(logs[0].includes('500'));
});
```

## Monitoring Integration

### Datadog Integration

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MonitoredApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'standard',
    },
    {
      name: 'datadog',
      type: 'HTTPHandler',
      level: SyslogSeverities.INFO,
      url: `https://http-intake.logs.datadoghq.com/v1/input/${
        Deno.env.get('DD_API_KEY')
      }`,
      batchSize: 100,
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': Deno.env.get('DD_API_KEY')!,
      },
      formatter: 'json',
    },
  ],
});

// Log with Datadog-specific tags
logger.info('Application started', {
  env: Deno.env.get('ENV'),
  version: Deno.env.get('APP_VERSION'),
  host: Deno.hostname(),
});
```

### Grafana Loki Integration

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';
import type { SlogObject } from '@tundralibs/slogger';

// Custom Loki formatter
function lokiFormatter(log: SlogObject): string {
  return JSON.stringify({
    streams: [{
      stream: {
        app: log.appName,
        level: log.levelName,
        hostname: log.hostname,
      },
      values: [[
        `${log.timestamp}000000`, // Nanosecond timestamp
        log.message,
      ]],
    }],
  });
}

const logger = new Slogger({
  appName: 'LokiApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'loki',
    type: 'HTTPHandler',
    level: SyslogSeverities.INFO,
    url: 'https://loki.example.com/loki/api/v1/push',
    batchSize: 50,
    headers: {
      'Content-Type': 'application/json',
    },
    formatter: lokiFormatter,
  }],
});
```

### Prometheus Metrics from Logs

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MetricsApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: 'json',
  }],
});

// Log metrics that can be scraped by Prometheus
function recordMetric(
  name: string,
  value: number,
  labels?: Record<string, string>,
) {
  logger.info('metric', {
    metric_name: name,
    metric_value: value,
    metric_type: 'gauge',
    ...labels,
  });
}

// Usage
recordMetric('http_requests_total', 1, { method: 'GET', status: '200' });
recordMetric('response_time_ms', 45, { endpoint: '/api/users' });
```

## Related Documentation

- [Configuration](Slogger-Configuration.md) - Configuration guide
- [Handlers](../handlers/Slogger-Handlers.md) - Handler details
- [Formatters](../formatters/Slogger-Formatters.md) - Formatter details
- [Performance](Slogger-Performance.md) - Performance tuning
- [Security](Slogger-Security.md) - Security best practices

---

[← Back to Slogger](../README.md)
