# Counter

A monotonic counter — values only ever increase.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [When to use](#when-to-use)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Output](#output)

## When to use

Reach for `Counter` when you want a cumulative count that only goes
up — requests served, errors raised, bytes written. For values that
move both directions (queue depth, active connections), use
[Gauge](MetroMan-Gauge.md) instead.

## Quick Start

```typescript
import { Counter } from '@tundralibs/metro-man';

const requests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests served',
});

requests.inc();
requests.inc({ status: '200', method: 'GET' });
requests.inc({ status: '500', method: 'GET' });
```

## API Reference

### `new Counter(options)`

**Parameters:**

- `options.name` — Required. Metric identifier; must match
  `/^[a-zA-Z_:][a-zA-Z0-9_:]*$/` (Prometheus name rules).
- `options.help` — Optional. Human description.

**Throws:**

- `InvalidMetricOptionsError` — When `name` is missing, not a string, or
  doesn't match `/^[a-zA-Z_:][a-zA-Z0-9_:]*$/`; or when `help` is given but
  not a string.

### `inc(amount?, labels?)`

Increment the named series. Overloads:

- `inc()` — increment unlabelled by 1
- `inc(labels)` — increment labelled by 1
- `inc(amount)` — increment unlabelled by `amount`
- `inc(amount, labels)` — increment labelled by `amount`

**Parameters:**

- `amount` — Optional non-negative finite number. Defaults to 1.
- `labels` — Optional `Record<string, string>`. Each distinct
  labels combination is a separate series.

**Throws:**

- `InvalidMetricOptionsError` — when `amount` is negative or
  non-finite.
- `InvalidLabelError` — when `labels` contains a name outside
  `[A-Za-z_][A-Za-z0-9_]*`.

### `reset()` / `remove(labels?)`

`reset()` drops every series; `remove(labels?)` drops a single series
and returns `true` if a series was actually removed. Both inherited from
`BaseMetric`.

### `toJSON()` / `toString()` / `toPrometheus()` / `dump(mode)`

Inherited from `BaseMetric`. See the
[main README](../README.md#output-formats) for the output shapes.

## Output

For the example above, after the three `inc()` calls:

```
# HELP http_requests_total Total HTTP requests served
# TYPE http_requests_total counter
http_requests_total 1
http_requests_total{status="200",method="GET"} 1
http_requests_total{status="500",method="GET"} 1
```

---

[← Back to MetroMan](../README.md)
