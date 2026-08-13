# MetroMan

Prometheus-compatible in-process metrics for Deno, Bun, and Node.js.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

MetroMan implements the four standard Prometheus metric types
(`Counter`, `Gauge`, `Histogram`, `Summary`) and a registry class
(`MetroMan`) that owns metric lifecycle and bulk collection. Metrics
expose three output shapes — `JSON`, a debug `STRING`, and the
Prometheus text exposition format — via a single `dump(mode)` method.

The package is intentionally small and dependency-light: it imports
only `@tundralibs/utils` (for the base error class) and
`@tundralibs/compat` (for cross-runtime tests). Storage is in-process;
there is no scrape endpoint or HTTP server bundled in.

## Modules

| Module      | Description                                              | Documentation                                    |
| ----------- | -------------------------------------------------------- | ------------------------------------------------ |
| `MetroMan`  | Registry — create, store, and bulk-collect metrics       | This page                                        |
| `Counter`   | Monotonic counter (values only increase)                 | [MetroMan-Counter](docs/MetroMan-Counter.md)     |
| `Gauge`     | Up/down value (set, inc, dec)                            | [MetroMan-Gauge](docs/MetroMan-Gauge.md)         |
| `Histogram` | Bucketed distribution                                    | [MetroMan-Histogram](docs/MetroMan-Histogram.md) |
| `Summary`   | Quantile-based distribution over a sliding window        | [MetroMan-Summary](docs/MetroMan-Summary.md)     |
| `./errors`  | `MetroManError` plus `InvalidMetricOptionsError` etc.    | [MetroMan-Errors](errors/MetroMan-Errors.md)     |
| `./types`   | `MetricOptions`, `MetricOutput`, per-metric option types | —                                                |

## Installation

**Deno:**

```bash
deno add @tundralibs/metro-man
```

**Bun:**

```bash
bunx jsr add @tundralibs/metro-man
```

**Node.js:**

```bash
npx jsr add @tundralibs/metro-man
```

## Quick Start

```typescript
import { MetroMan } from '@tundralibs/metro-man';

const metrics = new MetroMan();

const requests = metrics.counter({
  name: 'http_requests_total',
  help: 'HTTP requests served',
});
const inflight = metrics.gauge({ name: 'http_requests_in_flight' });
const latency = metrics.histogram({
  name: 'http_request_seconds',
  buckets: [0.05, 0.1, 0.5, 1, 5],
});

// Use them in the request path:
inflight.inc({ route: '/users' });
requests.inc({ route: '/users', status: '200' });
latency.observe(0.083, { route: '/users' });
inflight.dec({ route: '/users' });

// Expose them on /metrics or wherever:
console.log(metrics.collect('PROMETHEUS'));
```

Output (Prometheus text-exposition format):

```
# HELP http_requests_total HTTP requests served
# TYPE http_requests_total counter
http_requests_total{route="/users",status="200"} 1
# HELP http_requests_in_flight
# TYPE http_requests_in_flight gauge
http_requests_in_flight{route="/users"} 0
…
```

## Working without the registry

The registry is optional. Every metric class can be constructed and
used directly:

```typescript
import { Counter } from '@tundralibs/metro-man';

const errors = new Counter({ name: 'app_errors_total' });
errors.inc({ kind: 'timeout' });
console.log(errors.toPrometheus());
```

The registry adds three things on top: a single `collect()` call that
bulk-renders everything, case-insensitive name lookup via `get()`, and
a typed `has()` check. None of those are required if your app only
needs a handful of metrics in known locations.

## Output formats

Every metric implements `dump(mode)`:

| Mode           | Returns                  | Use for                                                |
| -------------- | ------------------------ | ------------------------------------------------------ |
| `'JSON'`       | `MetricOutput<T>` object | Structured logging, dashboards, in-process aggregation |
| `'STRING'`     | Bracketed `string`       | Ad-hoc debugging and log lines                         |
| `'PROMETHEUS'` | Exposition `string`      | Serving from a `/metrics` endpoint                     |

`MetroMan.collect(mode)` calls `dump(mode)` on every registered
metric and concatenates the results (string formats) or builds a
`name → MetricOutput` map (JSON).

The `'PROMETHEUS'` output is terminated with a trailing line feed — the
text-exposition format requires it ("The last line must end with a line
feed character"), and a body without it is rejected at EOF by the strict
parsers (Pushgateway ingestion, `promtool check metrics`). Every metric's
own `toPrometheus()` is self-terminated too, so a single metric served
directly to `/metrics` is equally well-formed. A metric declared but not
yet observed (a histogram or summary registered at startup and scraped
before its first observation) renders header-only — just its `# HELP` /
`# TYPE` lines — and that body is equally spec-valid: one terminating line
feed, no blank line, whether served alone or concatenated with other
families by `collect('PROMETHEUS')`.

## Labels

Every mutation method (`inc`, `set`, `observe`) accepts an optional
`labels: Record<string, string>`. Each distinct label combination
produces a distinct series — be mindful of cardinality. The
unlabelled series is keyed as `'no_label'`.

```typescript
import { Counter } from '@tundralibs/metro-man';

const counter = new Counter({ name: 'http_requests_total' });

counter.inc({ method: 'GET', status: '200' });
counter.inc({ method: 'GET', status: '500' });
counter.inc(); // unlabelled series
```

**Canonicalisation.** Label entries are sorted alphabetically by
name when the canonical key is built, so `{b:'2', a:'1'}` and
`{a:'1', b:'2'}` resolve to the same series.

**Escaping.** Label values are escaped per the Prometheus exposition
spec — `\` becomes `\\`, `"` becomes `\"`, and newlines become a
literal `\n`. Label _names_ cannot be escaped into validity, so they
are validated instead: a name outside
`[A-Za-z_][A-Za-z0-9_]*` throws `InvalidLabelError` wherever labels
enter (`inc`, `dec`, `set`, `observe`, `remove`).

**Reserved names.** `Histogram.observe` rejects a label called `le`
and `Summary.observe` rejects `quantile` — both clash with the
bucket / quantile labels those renderers emit. The thrown error is
`InvalidLabelError`.

## API Reference

### `new MetroMan()`

Construct an empty registry.

### `counter(options) → Counter`

Create a {@link MetroMan-Counter} and register it under
`options.name`.

### `gauge(options) → Gauge`

Create a {@link MetroMan-Gauge} and register it.

### `histogram(options) → Histogram`

Create a {@link MetroMan-Histogram} and register it.

### `summary(options) → Summary`

Create a {@link MetroMan-Summary} and register it.

### `register(...instances) → void`

Register one or more pre-built metric instances.

**Throws:**

- `DuplicateMetricError` — if any instance's name is already taken,
  by a previously registered metric or by another instance in the
  same call. Registration is all-or-nothing: when any name
  conflicts, no instances are stored. Remove the old metric with
  `remove()` or `clear()` the registry before re-registering.

### `has(name) → boolean`

Case-insensitive existence check.

### `get<T>(name) → T`

Case-insensitive lookup.

**Throws:**

- `MetricNotFoundError` when `name` is not registered.

### `collect(type?, metrics?) → string | Record<string, unknown>`

Dump some or all metrics in the requested format. Overloads:

```typescript ignore
collect('JSON', metrics?): Record<string, unknown>
collect('STRING', metrics?): string
collect('PROMETHEUS', metrics?): string
collect(metrics?: string[]): Record<string, unknown>  // defaults to JSON
```

When `metrics` is supplied it acts as a filter: unknown names are
skipped silently, and an empty list (`[]`) selects nothing — it
returns empty output (`{}` for JSON, `''` for the string formats),
not the whole registry. Only an omitted selection dumps every metric.
A name repeated in the list is emitted **once** — the selection is
de-duplicated, so `collect('PROMETHEUS', ['x', 'x'])` never produces
two `# HELP`/`# TYPE` blocks for the same family (which a Prometheus
scrape would reject).

### `remove(name) → boolean`

Remove the metric registered under `name`. Returns `true` if a
metric was actually removed.

### `clear() → void`

Remove every registered metric.

### `names: string[]` (getter)

All registered metric names (lower-cased).

## Metric instance API

Every metric inherits these methods from `BaseMetric`:

- `dump(mode)`, `toJSON()`, `toString()`, `toPrometheus()` — render
- `reset()` — drop every series, keep the metric registered
- `remove(labels?)` — drop a single series; returns `true` if found

Counter/Gauge expose `inc()` overloads that accept an optional
amount: `inc()`, `inc(labels)`, `inc(amount)`, `inc(amount, labels)`.
Gauge additionally exposes `dec()` with the same overloads and
`set(value, labels?)`. Counter rejects a negative amount. Every
numeric input (`inc`/`dec` amounts, `set` values, `observe`
observations) must be finite — `NaN` and `±Infinity` throw
`InvalidMetricOptionsError`, since they would render exposition most
scrapers reject.

## Related Documentation

- [Counter](docs/MetroMan-Counter.md) — monotonic counter
- [Gauge](docs/MetroMan-Gauge.md) — up/down value
- [Histogram](docs/MetroMan-Histogram.md) — bucketed distribution
- [Summary](docs/MetroMan-Summary.md) — quantile distribution with sliding window
- [Errors](errors/MetroMan-Errors.md) — error classes and matching strategies
- [`@tundralibs/slogger`](../slogger/README.md) /
  [`@tundralibs/tracer`](../tracer/README.md) — the sibling observability
  pillars (logs / traces); event-emitting packages feed all three from the
  same seam — see drivers'
  [Observability](../drivers/README.md#observability) section for the shape

## License

MIT
