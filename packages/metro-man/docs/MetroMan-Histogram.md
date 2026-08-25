# Histogram

Bucketed distribution of observed values.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [When to use](#when-to-use)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Bucket Semantics](#bucket-semantics)
- [Output](#output)

## When to use

Reach for `Histogram` when you want a distribution that aggregates
cleanly across instances (the bucket counts add). For exact quantiles
on a single instance, use [Summary](MetroMan-Summary.md) — but those
don't aggregate.

> **Memory is fixed per series, not traffic-proportional.** A
> Histogram series stores one counter per configured bucket —
> `buckets.length` numbers — regardless of how many observations it
> receives. [Summary](MetroMan-Summary.md)'s per-series memory instead
> grows with observation _rate_ (it retains raw samples for the whole
> `window`). Cardinality still multiplies either way: each label
> combination gets its own full bucket ladder, so 7 buckets × 100
> distinct label combinations is 700 stored counters (and 700
> rendered `_bucket` lines, plus `+Inf`/`_sum`/`_count` per series).
> See [Labels](../README.md#labels) for the cardinality-growth caveat
> that applies to every metric kind.

## Quick Start

```typescript
import { Histogram } from '@tundralibs/metro-man';

const latency = new Histogram({
  name: 'http_request_seconds',
  help: 'HTTP request latency',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

latency.observe(0.083, { route: '/users' });
latency.observe(0.420, { route: '/users' });
```

## API Reference

### `new Histogram(options)`

**Parameters:**

- `options.name` — Required. Metric identifier.
- `options.help` — Optional. Human description.
- `options.buckets` — Optional `number[]`. Defaults to
  `[1, 1.5, 2, 5, 10]`. Each bound must be a finite number; duplicate
  bounds are silently de-duplicated (see
  [Bucket Semantics](#bucket-semantics)) and the result sorted
  ascending internally.

**Throws:**

- `InvalidMetricOptionsError` — When `name` is missing, or `buckets`
  is present but not an array of numbers, or contains a non-finite
  bound (`NaN`, `±Infinity`).

### `observe(value, labels?)`

Record a single observation. For every bucket whose upper bound is
`>= value`, the bucket counter is incremented; `value` is added to
the series' running `sum`; and the series' total observation
`count` is incremented by 1 (independently of the buckets, so it
stays correct when observations exceed the largest finite bucket).

**Throws:**

- `InvalidMetricOptionsError` — when `value` is non-finite (`NaN`,
  `±Infinity`).
- `InvalidLabelError` — when `labels` contains `le` (reserved for
  Prometheus bucket labels), or a name outside
  `[A-Za-z_][A-Za-z0-9_]*`.

### `reset()` / `remove(labels?)`

`reset()` drops every series; `remove(labels?)` drops a single series
and returns `true` if a series was actually removed. Both inherited from
`BaseMetric`.

**Throws:**

- `InvalidLabelError` — `remove(labels)` rejects a label name outside
  `[A-Za-z_][A-Za-z0-9_]*`, the same validation `observe` applies.

### `toJSON()` / `toString()` / `toPrometheus()` / `dump(mode)`

Inherited from `BaseMetric`. `toPrometheus()` is overridden to emit
the `_bucket{le="…"}` / `_sum` / `_count` triple per series.

## Bucket Semantics

Buckets are cumulative — an observation of `0.3` lands in every
bucket whose upper bound is `>= 0.3`. The exposition format adds an
`+Inf` bucket at the end carrying the total observation count.
Observations above the largest finite bucket still increment
`_count` and the `+Inf` bucket — they simply don't appear in any
finite bucket.

Every output format lists buckets in ascending upper-bound order:
the JSON payload carries them as an ordered
`Array<{ le: number; count: number }>` (a numeric-keyed record
would list integer bounds before decimal ones).

> **Duplicate bounds are silently collapsed.** `buckets` is
> de-duplicated with `new Set()` before sorting, so `[1, 1, 2]`
> becomes two buckets, not three — `0` and `-0` also collapse to a
> single bound. A repeated `le` value would otherwise render the same
> series twice, which a strict Prometheus scraper rejects outright.
> If your bucket list is concatenated from more than one config
> source, expect fewer buckets than the combined input length
> whenever they overlap.

## Output

For the [Quick Start](#quick-start) example above.

### Prometheus text (`toPrometheus()` / `dump('PROMETHEUS')`)

```
# HELP http_request_seconds HTTP request latency
# TYPE http_request_seconds histogram
http_request_seconds_bucket{route="/users",le="0.05"} 0
http_request_seconds_bucket{route="/users",le="0.1"} 1
http_request_seconds_bucket{route="/users",le="0.25"} 1
http_request_seconds_bucket{route="/users",le="0.5"} 2
…
http_request_seconds_bucket{route="/users",le="+Inf"} 2
http_request_seconds_sum{route="/users"} 0.503
http_request_seconds_count{route="/users"} 2
```

### JSON (`toJSON()` / `dump('JSON')`)

```json
{
  "name": "http_request_seconds",
  "help": "HTTP request latency",
  "type": "HISTOGRAM",
  "labels": ["route"],
  "data": {
    "route=\"/users\"": {
      "buckets": [
        { "le": 0.05, "count": 0 },
        { "le": 0.1, "count": 1 },
        { "le": 0.25, "count": 1 },
        { "le": 0.5, "count": 2 },
        { "le": 1, "count": 2 },
        { "le": 2.5, "count": 2 },
        { "le": 5, "count": 2 }
      ],
      "sum": 0.503,
      "count": 2
    }
  }
}
```

---

[← Back to MetroMan](../README.md)
