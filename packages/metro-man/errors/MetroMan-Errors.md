# Errors

Error classes thrown by `@tundralibs/metro-man`.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Hierarchy](#hierarchy)
- [MetroManError](#metromanerror)
- [InvalidMetricOptionsError](#invalidmetricoptionserror)
- [DuplicateMetricError](#duplicatemetricerror)
- [InvalidLabelError](#invalidlabelerror)
- [MetricNotFoundError](#metricnotfounderror)
- [Matching strategy](#matching-strategy)

## Hierarchy

```
Error
└── BaseError                          // from @tundralibs/utils
    └── MetroManError                   // package base — branch here to catch any metro-man error
        ├── InvalidMetricOptionsError   // option/argument validation in a metric constructor or method
        ├── InvalidLabelError           // labels include a reserved (`le`, `quantile`) or invalid name
        ├── DuplicateMetricError        // MetroMan.register() name collision
        └── MetricNotFoundError         // MetroMan.get(name) miss
```

Every error in this package derives from `MetroManError`, which in
turn derives from `BaseError`. That gives you the standard
`context` payload, `${var}` substitution in messages, cause chaining,
and JSON serialisation.

## MetroManError

Package base. Use it to catch _any_ error this package throws
without committing to a specific class:

```typescript
import { MetroMan, MetroManError } from '@tundralibs/metro-man';

const registry = new MetroMan();

try {
  registry.get('something');
} catch (e) {
  if (e instanceof MetroManError) {
    // metro-man-originated failure
  }
  throw e;
}
```

Not thrown directly — only derived classes are.

## InvalidMetricOptionsError

Thrown from a metric constructor (`Counter`, `Gauge`, `Histogram`,
`Summary`) when its options fail validation: missing `name`, wrong
`type`, malformed `buckets` / `quantiles`, out-of-range `window`.

```typescript
import { Counter, InvalidMetricOptionsError } from '@tundralibs/metro-man';

try {
  new Counter({} as never);
} catch (e) {
  if (e instanceof InvalidMetricOptionsError) {
    console.log(e.context.field); // 'name'
    console.log(e.context.metricType); // optional, e.g. 'HISTOGRAM'
  }
}
```

**Context:**

- `field: string` — Offending option key.
- `metricType?: string` — Expected metric type when relevant.

## DuplicateMetricError

Thrown by `MetroMan.register` (and the factory methods) when a
metric is already registered under the same case-insensitive name.

```typescript
import { DuplicateMetricError, MetroMan } from '@tundralibs/metro-man';

const m = new MetroMan();
m.counter({ name: 'requests' });
try {
  m.counter({ name: 'requests' });
} catch (e) {
  if (e instanceof DuplicateMetricError) {
    console.log(e.context.name); // 'requests'
  }
}
```

**Context:**

- `name: string` — Normalised lookup key of the already-registered
  metric.

## InvalidLabelError

Thrown when a labels record is rejected. Two reasons:

- `'reserved'` — `Histogram.observe` / `Summary.observe` received a
  Prometheus-reserved name (`le` for histograms, `quantile` for
  summaries).
- `'invalid'` — any label-accepting method (`inc`, `dec`, `set`,
  `observe`, `remove`) received a name outside the legal Prometheus
  label pattern `[A-Za-z_][A-Za-z0-9_]*` — such a name would render
  malformed exposition and cannot be fixed by escaping.

```typescript
import { Histogram, InvalidLabelError } from '@tundralibs/metro-man';

const histogram = new Histogram({ name: 'request_seconds' });

try {
  histogram.observe(1, { le: '5' });
} catch (e) {
  if (e instanceof InvalidLabelError) {
    console.log(e.context.label); // 'le'
    console.log(e.context.reason); // 'reserved'
    console.log(e.context.metricType); // 'HISTOGRAM'
  }
}
```

**Context:**

- `label: string` — Offending label name.
- `reason: 'reserved' | 'invalid'` — Why it's rejected.
- `metricType: string` — Metric type that rejected it.

## MetricNotFoundError

Thrown by `MetroMan.get(name)` when the registry has no entry under
the (case-insensitive) name. `MetroMan.has(name)` is the
non-throwing alternative.

```typescript
import { MetricNotFoundError, MetroMan } from '@tundralibs/metro-man';

const registry = new MetroMan();

try {
  registry.get('nope');
} catch (e) {
  if (e instanceof MetricNotFoundError) {
    console.log(e.context.name); // 'nope' (lower-cased)
  }
}
```

**Context:**

- `name: string` — The lookup name as the registry stores it
  (trimmed, lower-cased).

## Matching strategy

Branch with `instanceof` and read `error.context` for variant-specific
data — there is no error-code table. If you need to surface the
failure to an end user, use the message; if you need to drive a code
path, read `context.field` (validation) or `context.name` (lookup).

---

[← Back to MetroMan](../README.md)
