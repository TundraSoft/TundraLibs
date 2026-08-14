# WebServer Metrics

Reference for the WebServer module's built-in performance metrics.

## Table of Contents

- [Overview](#overview)
- [Accessing Metrics](#accessing-metrics)
- [Metrics Structure](#metrics-structure)
  - [Request Metrics](#request-metrics)
  - [Status Codes](#status-codes)
  - [Response Time](#response-time)
  - [WebSocket Metrics](#websocket-metrics)
- [Usage Patterns](#usage-patterns)
- [Best Practices](#best-practices)

## Overview

The WebServer module automatically tracks performance metrics for all requests and WebSocket connections. Metrics are collected in-memory with minimal overhead.

**Key features:**

- Zero-configuration metrics collection
- Accurate averages using accumulated sums
- Peak tracking for capacity planning
- WebSocket connection and message stats
- Thread-safe metric updates

## Accessing Metrics

Access metrics via the `metrics` property:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

const metrics = server.metrics;
```

The returned object is a **deep copy** to prevent external mutation. Access it as often as needed without affecting performance.

Reset all metrics to initial values:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

server.resetMetrics();
```

## Metrics Structure

```typescript
interface ServerMetrics {
  requests: {
    total: number;
    active: number;
    peakActive: number;
  };
  statusCodes: {
    '1xx': number;
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
  };
  responseTime: {
    min: number;
    max: number;
    average: number;
  };
  websocket: {
    upgrades: number;
    connections: {
      total: number;
      active: number;
      peakActive: number;
    };
    messages: {
      received: number;
      sent: number;
    };
    errors: number;
    connectionDuration: {
      min: number;
      max: number;
      average: number;
    };
  };
}
```

### Request Metrics

| Field        | Type     | Description                                |
| ------------ | -------- | ------------------------------------------ |
| `total`      | `number` | Total requests processed since start/reset |
| `active`     | `number` | Currently processing requests              |
| `peakActive` | `number` | Highest concurrent requests observed       |

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

const { requests } = server.metrics;

console.log(`Total requests: ${requests.total}`);
console.log(`Currently processing: ${requests.active}`);
console.log(`Peak concurrent: ${requests.peakActive}`);
```

**Notes:**

- `active` is incremented before handler runs, decremented after response
- `peakActive` helps with capacity planning and load testing
- `total` includes both successful and failed requests

### Status Codes

Status codes are grouped by category:

| Field | Range   | Description   |
| ----- | ------- | ------------- |
| `1xx` | 100-199 | Informational |
| `2xx` | 200-299 | Success       |
| `3xx` | 300-399 | Redirection   |
| `4xx` | 400-499 | Client errors |
| `5xx` | 500-599 | Server errors |

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

const { statusCodes } = server.metrics;

console.log(`Success: ${statusCodes['2xx']}`);
console.log(`Client errors: ${statusCodes['4xx']}`);
console.log(`Server errors: ${statusCodes['5xx']}`);

// Calculate error rate
const total = Object.values(statusCodes).reduce((a, b) => a + b, 0);
const errorRate = (statusCodes['4xx'] + statusCodes['5xx']) / total;
console.log(`Error rate: ${(errorRate * 100).toFixed(2)}%`);
```

### Response Time

Response times are in **milliseconds**:

| Field     | Type     | Description           |
| --------- | -------- | --------------------- |
| `min`     | `number` | Fastest response time |
| `max`     | `number` | Slowest response time |
| `average` | `number` | Average response time |

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

const { responseTime } = server.metrics;

console.log(`Min: ${responseTime.min.toFixed(2)}ms`);
console.log(`Max: ${responseTime.max.toFixed(2)}ms`);
console.log(`Avg: ${responseTime.average.toFixed(2)}ms`);
```

**Notes:**

- `min` starts at `Infinity` until first request
- Average is calculated using accumulated sum for precision
- Time includes handler execution plus framework overhead

### WebSocket Metrics

| Field                        | Type     | Description                      |
| ---------------------------- | -------- | -------------------------------- |
| `upgrades`                   | `number` | Total WebSocket upgrade attempts |
| `connections.total`          | `number` | Total connections established    |
| `connections.active`         | `number` | Currently open connections       |
| `connections.peakActive`     | `number` | Peak concurrent connections      |
| `messages.received`          | `number` | Total messages received          |
| `messages.sent`              | `number` | Total messages sent              |
| `errors`                     | `number` | WebSocket errors (Deno only)     |
| `connectionDuration.min`     | `number` | Shortest connection (ms)         |
| `connectionDuration.max`     | `number` | Longest connection (ms)          |
| `connectionDuration.average` | `number` | Average connection duration (ms) |

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

const { websocket } = server.metrics;

console.log(`Active connections: ${websocket.connections.active}`);
console.log(`Peak connections: ${websocket.connections.peakActive}`);
console.log(`Messages in: ${websocket.messages.received}`);
console.log(`Messages out: ${websocket.messages.sent}`);
console.log(
  `Avg duration: ${(websocket.connectionDuration.average / 1000).toFixed(1)}s`,
);
```

## Usage Patterns

### Metrics Endpoint

Expose metrics via HTTP:

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server: WebServer = new WebServer('API', {
  mode: 'TCP',
  port: 8080,
  handler: (req): Response => {
    const url = new URL(req.url);

    if (url.pathname === '/metrics') {
      return Response.json(server.metrics);
    }

    if (url.pathname === '/health') {
      return Response.json({
        status: 'healthy',
        uptime: process.uptime(),
        requests: server.metrics.requests.total,
      });
    }

    return new Response('OK');
  },
});
```

### Prometheus Format

Export in Prometheus text format:

```typescript
import type { ServerMetrics, WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

function formatPrometheus(metrics: ServerMetrics): string {
  const lines: string[] = [];

  // Request metrics
  lines.push(`# HELP http_requests_total Total HTTP requests`);
  lines.push(`# TYPE http_requests_total counter`);
  lines.push(`http_requests_total ${metrics.requests.total}`);

  lines.push(`# HELP http_requests_active Active HTTP requests`);
  lines.push(`# TYPE http_requests_active gauge`);
  lines.push(`http_requests_active ${metrics.requests.active}`);

  // Status codes
  lines.push(`# HELP http_responses_total HTTP responses by status`);
  lines.push(`# TYPE http_responses_total counter`);
  for (const [code, count] of Object.entries(metrics.statusCodes)) {
    lines.push(`http_responses_total{status="${code}"} ${count}`);
  }

  // Response time
  lines.push(`# HELP http_response_time_ms Response time in milliseconds`);
  lines.push(`# TYPE http_response_time_ms summary`);
  lines.push(
    `http_response_time_ms{quantile="min"} ${metrics.responseTime.min}`,
  );
  lines.push(
    `http_response_time_ms{quantile="max"} ${metrics.responseTime.max}`,
  );
  lines.push(
    `http_response_time_ms{quantile="avg"} ${metrics.responseTime.average}`,
  );

  return lines.join('\n');
}

// In handler:
function handler(req: Request): Response {
  const url = new URL(req.url);

  if (
    url.pathname === '/metrics' &&
    req.headers.get('accept')?.includes('text/plain')
  ) {
    return new Response(formatPrometheus(server.metrics), {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response('OK');
}
```

### Periodic Logging

Log metrics periodically:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

setInterval(() => {
  const m = server.metrics;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    requests: m.requests.total,
    active: m.requests.active,
    errors: m.statusCodes['5xx'],
    avgResponseMs: m.responseTime.average.toFixed(2),
    wsConnections: m.websocket.connections.active,
  }));
}, 60000);
```

### Rolling Window

Reset metrics periodically for rolling stats:

```typescript
import type { ServerMetrics, WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

let hourlyStats: ServerMetrics[] = [];

setInterval(() => {
  // Save current metrics
  hourlyStats.push(server.metrics);

  // Keep last 24 hours
  if (hourlyStats.length > 24) {
    hourlyStats.shift();
  }

  // Reset for next hour
  server.resetMetrics();
}, 3600000);

// Calculate daily totals
function getDailyStats() {
  return hourlyStats.reduce((acc, m) => ({
    requests: acc.requests + m.requests.total,
    errors: acc.errors + m.statusCodes['5xx'],
  }), { requests: 0, errors: 0 });
}
```

### Alerting

Alert on thresholds:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

setInterval(() => {
  const m = server.metrics;

  // High error rate
  const errorRate = m.statusCodes['5xx'] / m.requests.total;
  if (errorRate > 0.05) {
    alert(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
  }

  // Slow responses
  if (m.responseTime.average > 1000) {
    alert(`Slow responses: avg ${m.responseTime.average.toFixed(0)}ms`);
  }

  // Many active requests (potential bottleneck)
  if (m.requests.active > 100) {
    alert(`High concurrency: ${m.requests.active} active requests`);
  }
}, 30000);
```

## Best Practices

### 1. Don't Reset During Load

Avoid resetting metrics while processing requests - the `active` count will be inaccurate:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

// Bad - resets active count mid-request
server.resetMetrics();

// Good - reset during quiet periods
if (server.metrics.requests.active === 0) {
  server.resetMetrics();
}
```

### 2. Copy Metrics for Async Work

The metrics object is a copy, so it's safe to use asynchronously:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;
declare function saveToDatabase(snapshot: unknown): Promise<void>;

// Safe - works with a snapshot
const snapshot = server.metrics;
await saveToDatabase(snapshot);
```

### 3. Handle Initial Values

`min` starts at `Infinity` before any requests:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

const { responseTime } = server.metrics;
const minDisplay = responseTime.min === Infinity
  ? 'N/A'
  : `${responseTime.min.toFixed(2)}ms`;
```

### 4. Consider Memory

Metrics are lightweight, but if you're storing historical data:

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

// Store only essential fields
const snapshot = {
  timestamp: Date.now(),
  total: server.metrics.requests.total,
  errors: server.metrics.statusCodes['5xx'],
  avgMs: server.metrics.responseTime.average,
};
```

### 5. Separate Metrics Server

For production, consider a dedicated metrics endpoint:

```typescript ignore
// Main API server
const apiServer = new WebServer('API', { port: 8080, ... });

// Metrics server (different port, internal only)
const metricsServer = new WebServer('Metrics', {
  mode: 'TCP',
  port: 9090,
  hostname: '127.0.0.1', // Internal only
  handler: () => Response.json(apiServer.metrics),
});

metricsServer.start();
metricsServer.unref(); // Don't block shutdown
```

---

[← Back to WebServer](../Compat-WebServer.md)
