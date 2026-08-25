# Summary

Cumulative `_sum`/`_count` with quantile estimates over a sliding
time window.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [When to use](#when-to-use)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Cumulative totals vs windowed quantiles](#cumulative-totals-vs-windowed-quantiles)
- [Sliding Window](#sliding-window)
- [Output](#output)

## When to use

Reach for `Summary` when you need exact quantiles (p50/p90/p99) over
a single instance's recent observations. For distributions that
aggregate cleanly across instances, use
[Histogram](MetroMan-Histogram.md) instead — summaries don't
combine across processes.

> **Memory scales with traffic, not just cardinality.** A Summary
> keeps every raw observation from the last `window` seconds per
> label combination, so a high-throughput series retains far more
> data than a low-throughput one — unlike
> [Histogram](MetroMan-Histogram.md), whose per-series memory is
> fixed by its bucket count regardless of traffic. Combine high
> traffic with high label cardinality and the windowed sample buffer
> grows accordingly between purges (see
> [Sliding Window](#sliding-window)). See
> [Labels](../README.md#labels) for the cardinality-growth caveat that
> applies to every metric kind.

## Quick Start

```typescript
import { Summary } from '@tundralibs/metro-man';

const latency = new Summary({
  name: 'http_request_seconds',
  quantiles: [0.5, 0.9, 0.99],
  window: 60,
});

latency.observe(0.083, { route: '/users' });
latency.observe(0.420, { route: '/users' });
console.log(latency.toPrometheus());
```

## API Reference

### `new Summary(options)`

**Parameters:**

- `options.name` — Required. Metric identifier.
- `options.help` — Optional. Human description.
- `options.quantiles` — Optional `number[]`. Defaults to
  `[0.5, 0.9, 0.99]`. Each value must be a finite number in `[0, 1]`;
  duplicate values are silently de-duplicated (see
  [Quantile Calculation](#quantile-calculation)) and the result sorted
  ascending internally.
- `options.window` — Optional retention window in seconds. Defaults
  to `600` (the maximum) so retention is always bounded. Must be a
  finite number in `[1, 600]` when provided (`NaN`/`Infinity` are
  rejected — they would disable the purge and let memory grow
  unbounded).

**Throws:**

- `InvalidMetricOptionsError` — When `name` is missing, not a string,
  or doesn't match `/^[a-zA-Z_:][a-zA-Z0-9_:]*$/`; when `help` is given
  but not a string; when `quantiles` is not an array of finite numbers
  in `[0, 1]`; or when `window` is non-numeric, non-finite, or outside
  `[1, 600]`.

### `observe(value, labels?)`

Record a single observation. The value is added to the series'
cumulative `_sum`/`_count` (lifetime totals) and also bucketed by the
current epoch second so the [sliding window](#sliding-window) can
purge old samples from the quantile buffer.

**Throws:**

- `InvalidMetricOptionsError` — when `value` is non-finite (`NaN`,
  `±Infinity`).
- `InvalidLabelError` — when `labels` contains `quantile`
  (reserved for the rendered quantile lines), or a name outside
  `[A-Za-z_][A-Za-z0-9_]*`.

### `reset()` / `remove(labels?)`

`reset()` drops every series **and** the cumulative lifetime
`sum`/`count` totals — lifetime accounting starts over from zero (see
[Cumulative totals vs windowed quantiles](#cumulative-totals-vs-windowed-quantiles)).
`remove(labels?)` drops a single series' totals and windowed quantile
buffer together, returning `true` if a series was actually removed.
Both overridden from `BaseMetric` to also clear the raw-sample state.

**Throws:**

- `InvalidLabelError` — `remove(labels)` rejects a label name outside
  `[A-Za-z_][A-Za-z0-9_]*`, the same validation `observe` applies.

### `toJSON()` / `toString()` / `toPrometheus()` / `dump(mode)`

Inherited from `BaseMetric`. All three call `_calculate()` first so
that quantiles always reflect the freshest window.

## Cumulative totals vs windowed quantiles

`_sum` and `_count` are **cumulative for the process lifetime**
(monotonic — they accumulate on every `observe()` and are never
purged), matching Prometheus / `client_golang` summary semantics.
Only the reported **quantile** estimates slide over the `window`.

This split matters when a summary is scraped: `rate(x_count[5m])`
and `increase(x_sum[5m])` assume the underlying series only ever
increases. If `_sum`/`_count` decreased as samples aged out of the
window, a scraper would misread that decrease as a counter reset and
compute wrong values. Keeping the totals cumulative makes the
scraped output safe to use with `rate()` / `increase()`, while the
windowed quantiles still answer "what do recent percentiles look
like?".

`reset()` clears the cumulative totals (lifetime accounting starts
over); `remove(labels)` drops a single series' totals and quantile
buffer together.

## Sliding Window

The quantile estimates are computed only from samples observed in the
last `window` seconds (default `600` — the maximum); older samples
are dropped from the quantile buffer on the next purge. `_sum` and
`_count` are **not** windowed — see
[Cumulative totals vs windowed quantiles](#cumulative-totals-vs-windowed-quantiles).
Purges run:

- At read time — every call to `toJSON()` / `toPrometheus()` /
  `toString()` (or `dump(...)`) triggers `_calculate()`, which
  purges first.
- At write time — `observe()` triggers a purge once at least
  `window` seconds have elapsed since the previous purge. This
  bounds the quantile buffer to roughly two windows' worth of data
  even if you never read.

The window always applies to the quantiles — omitting it means "keep
the last 10 minutes of samples", not "keep everything" — so a
long-running summary's quantile buffer cannot grow without bound.

## Quantile Calculation

Quantiles use linear interpolation between the two nearest ranked
samples:

```
rank  = (n - 1) * q
base  = floor(rank)
frac  = rank - base
value = sorted[base] + frac * (sorted[base + 1] - sorted[base])
```

`n` is the number of observations in the current window. For an
empty window, the quantile is `0` (a finite value — many scrapers
reject `NaN`).

> **Duplicate quantiles are silently collapsed.** `quantiles` is
> de-duplicated with `new Set()` before sorting, so
> `[0.5, 0.5, 0.9]` renders two quantile lines, not three. A repeated
> `quantile` value would otherwise render the same series twice,
> which a strict Prometheus scraper rejects outright.

## Output

For the [Quick Start](#quick-start) example above.

### Prometheus text (`toPrometheus()` / `dump('PROMETHEUS')`)

```
# HELP http_request_seconds
# TYPE http_request_seconds summary
http_request_seconds{route="/users",quantile="0.5"} 0.2515
http_request_seconds{route="/users",quantile="0.9"} 0.3863
http_request_seconds{route="/users",quantile="0.99"} 0.41663
http_request_seconds_sum{route="/users"} 0.503
http_request_seconds_count{route="/users"} 2
```

### JSON (`toJSON()` / `dump('JSON')`)

```json
{
  "name": "http_request_seconds",
  "help": "",
  "type": "SUMMARY",
  "labels": ["route"],
  "data": {
    "route=\"/users\"": {
      "quantile": { "0.5": 0.2515, "0.9": 0.3863, "0.99": 0.41663 },
      "count": 2,
      "sum": 0.503
    }
  }
}
```

---

[← Back to MetroMan](../README.md)
