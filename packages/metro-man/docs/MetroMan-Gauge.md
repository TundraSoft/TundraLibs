# Gauge

An up/down value — set to any number, then increment and decrement
freely.

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

Reach for `Gauge` when the value can go both up and down — queue
depth, in-flight connections, memory in use, temperature. For
monotonically-increasing counts, use [Counter](MetroMan-Counter.md).

## Quick Start

```typescript
import { Gauge } from '@tundralibs/metro-man';

const queue = new Gauge({ name: 'queue_depth' });
queue.set(0);
queue.inc({ priority: 'high' });
queue.inc({ priority: 'high' });
queue.dec({ priority: 'high' });
```

## API Reference

### `new Gauge(options)`

**Parameters:**

- `options.name` — Required. Metric identifier; must match
  `/^[a-zA-Z_:][a-zA-Z0-9_:]*$/` (Prometheus name rules).
- `options.help` — Optional. Human description.

**Throws:**

- `InvalidMetricOptionsError` — When `name` is missing, not a string, or
  doesn't match `/^[a-zA-Z_:][a-zA-Z0-9_:]*$/`; or when `help` is given but
  not a string.

### `set(value, labels?)`

Replace the named series with `value`.

**Throws:**

- `InvalidMetricOptionsError` — when `value` is non-finite (`NaN`,
  `±Infinity`).
- `InvalidLabelError` — when `labels` contains a name outside
  `[A-Za-z_][A-Za-z0-9_]*`.

### `inc(amount?, labels?)` / `dec(amount?, labels?)`

Adjust the named series. Series default to 0 if absent. Overloads:

- `inc()` / `dec()` — ±1 on unlabelled
- `inc(labels)` / `dec(labels)` — ±1 on labelled
- `inc(amount)` / `dec(amount)` — ±`amount` on unlabelled
- `inc(amount, labels)` / `dec(amount, labels)` — ±`amount` on labelled

**Throws:**

- `InvalidMetricOptionsError` — when `amount` is non-finite.
- `InvalidLabelError` — when `labels` contains a name outside
  `[A-Za-z_][A-Za-z0-9_]*`.

### `reset()` / `remove(labels?)`

`reset()` drops every series; `remove(labels?)` drops a single series
and returns `true` if a series was actually removed. Both inherited
from `BaseMetric`.

**Throws:**

- `InvalidLabelError` — `remove(labels)` rejects a label name outside
  `[A-Za-z_][A-Za-z0-9_]*`, the same validation `set`/`inc`/`dec`
  apply.

### `toJSON()` / `toString()` / `toPrometheus()` / `dump(mode)`

Inherited from `BaseMetric`.

## Output

### Prometheus text (`toPrometheus()` / `dump('PROMETHEUS')`)

```
# HELP queue_depth
# TYPE queue_depth gauge
queue_depth 0
queue_depth{priority="high"} 1
```

### JSON (`toJSON()` / `dump('JSON')`)

```json
{
  "name": "queue_depth",
  "help": "",
  "type": "GAUGE",
  "labels": ["priority"],
  "data": {
    "no_label": 0,
    "priority=\"high\"": 1
  }
}
```

---

[← Back to MetroMan](../README.md)
