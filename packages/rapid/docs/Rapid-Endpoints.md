# Endpoints

The ready-made handlers in `@tundralibs/rapid/endpoints` — liveness,
readiness, metrics, the OpenAPI document and the API reference page — what
each answers, what it takes, and how they behave as ordinary routes.

---

## TL;DR

- Nothing is auto-registered. You mount each handler where you like:
  `app.get('/healthz', health())`. Only `docs()` mounts itself (it registers
  a page plus a script route), so it takes the app instead.
- They are **ordinary routes**: they appear in OpenAPI, take route middleware
  (`app.get(path, authorize(...), metrics())`), respect surfaces and
  versioning, and go through the same error pipeline as your own handlers.
- `health()` is **liveness**, `ready()` is **readiness** — point the
  platform's two probes at the two handlers. Both keep the failure cause
  server-side.
- `metrics()` answers 503 until `server.metrics` is on; `openapi()` and
  `docs()` answer 404 outside the modes their `expose` names (DEVELOPMENT
  only by default).
- Session routes (`login`, `logout`, `refresh`, `me`) are **not** here —
  they come from the pact adapter's factory, so they share one cookie name
  with `authenticate`. See [Authentication & authorization](./Rapid-Auth.md).

---

## Mounting

```ts
import { Application } from '@tundralibs/rapid';
import {
  docs,
  health,
  metrics,
  openapi,
  ready,
} from '@tundralibs/rapid/endpoints';

const app = await Application.initialize({
  name: 'api',
  server: { metrics: true },
});

app.get('/healthz', health());
app.get('/readyz', ready({ check: () => Promise.resolve() }));
app.get('/metrics', metrics());
app.get('/openapi.json', openapi());
docs(app, { spec: '/openapi.json' });
```

Every handler is a plain `RapidHTTPHandler`, so the path, the method and any
route middleware are yours. Two consequences worth knowing:

- **Surfaces.** On an app with an api surface (`server.api`), the JSON
  handlers exist on both surfaces like any API route; the `docs()` page is a
  page, so it exists on the ui surface only. Prefix the probe paths the way
  your platform expects — nothing is reserved.
- **Versioning.** A versioned app resolves these routes like any other
  (exact → default → unversioned). Mount them unversioned unless you want
  `/v2/healthz` to exist.

## `health()` — liveness

`GET` → `200 { status: 'ok', instance }`. `instance` is `app.instanceId`,
the per-boot id, handy when several replicas sit behind one address.

| Option  | Default | What it does                                                                                                                     |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `check` | none    | `(ctx) => unknown \| Promise<unknown>`; a throw or rejection answers `503 { status: 'unhealthy' }`. The return value is ignored. |

The cause of a failed check is logged at `warn` (`readiness check failed`,
with `reason`) and **never sent**: a check usually touches a database or a
downstream whose error text can carry hostnames, DSNs or credentials, and
the probe path is public.

Keep the liveness check cheap or absent — a liveness probe that fails when
the database is slow gets a healthy process restarted. Put dependency checks
on `ready()`.

## `ready()` — readiness

`GET` → `200 { status: 'ready', instance }`, or 503 in two cases:

| Reply                         | When                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `503 { status: 'draining' }`  | `app.stop()` has begun (`app.stopping` is `true`) — checked first, before any `check`. In-flight requests still complete during the drain. |
| `503 { status: 'unhealthy' }` | The `check` threw or rejected; logged like `health()`'s, never sent.                                                                       |

| Option  | Default | What it does                                                                                            |
| ------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `check` | none    | The dependency probe — a pool ping, a cache round-trip. Same signature and disclosure rule as `health`. |

Use it as the platform's readiness probe: the moment a graceful shutdown
starts, the replica reports not-ready, the load balancer stops routing new
connections to it, and the drain window (`shutdownTimeout`, seconds — see
the [configuration reference](./Rapid-Configuration.md)) finishes the
requests already in flight.

## `metrics()` — the scrape target

Serves `app.meter` — the metro-man registry `server.metrics` creates — as
Prometheus text (`content-type: text/plain; version=0.0.4`) or JSON.

| Option   | Default        | Values                   |
| -------- | -------------- | ------------------------ |
| `format` | `'prometheus'` | `'prometheus' \| 'json'` |

With `server.metrics` off there is no meter, and the endpoint answers a
plain operational `503 { status: 'disabled', message }` (not a `RAPID_*`
error — nothing went wrong). Which series exist depends on the families
enabled: `server.metrics: true` turns on all seven (`requests`, `errors`,
`jobs`, `sockets`, `middleware`, `bodies`, `ui`); the object form picks.
Series are prefixed `rapid_` (`rapid_requests_total`,
`rapid_request_duration_ms`, `rapid_job_runs_total`, …) — the full list per
family is in the [configuration reference](./Rapid-Configuration.md#servermetrics--metric-families).
Your own instruments registered on `app.meter.registry` are served by the
same endpoint.

The scrape path is usually not for the public: mount it on an internal
port, behind `authorize()`, or on an api surface your ingress does not
expose.

## `openapi()` — the document

`GET` → the assembled OpenAPI 3.0.3 document, built from the registered
routes on first request and cached per version (`?version=v2` selects one).

| Option            | Default                                       | What it does                                                                                   |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `info`            | `title` = the app `name`, `version` = `1.0.0` | Merged over the defaults.                                                                      |
| `servers`         | omitted                                       | `{ url, description? }[]`.                                                                     |
| `securitySchemes` | `bearerAuth` only                             | The exact OpenAPI shapes (`http` / `apiKey` / `oauth2` / `openIdConnect`), validated at mount. |
| `expose`          | `'DEVELOPMENT'`                               | `'PRODUCTION'` or `'ALL'`; any other mode answers a plain `RAPID_NOT_FOUND` 404.               |

The document is the subject of its own guide —
[OpenAPI and the API reference](./Rapid-OpenAPI.md) — which covers what the
routes and decorators contribute, the scheme types and their validation, and
versions.

## `docs()` — the API reference page

`docs(app, options)` mounts a page (default `/docs`) that renders the same
document: server-side from rapid's own templates inside your core/layout,
with an optional credential box and try-it forms, or through a pinned
Scalar / Redoc / Swagger UI shell. Gated by `expose` like `openapi()`, takes
`guards` for an authorized production reference, and never lists itself.
Options, the credential box, the two customization paths and the pitfalls
are in [OpenAPI and the API reference](./Rapid-OpenAPI.md).

## Pitfalls

- **Probes and `expose` are different gates.** `health()` / `ready()` /
  `metrics()` serve in every mode; only `openapi()` and `docs()` are
  mode-gated. Locking a probe down is your route middleware's job.
- **A readiness check that writes** (a heartbeat row, say) runs on every
  probe interval — keep both checks read-only and bounded.
- **`ready()` inside a `timeout()` scope** — a slow dependency check hits the
  route timeout and answers `RAPID_TIMEOUT` (a 504), not `unhealthy`. Either
  is not-ready to a probe, but the log line differs.
- **The reference documents the probes too.** `health()` and the rest are
  routes, so they appear in the OpenAPI document; give them `openapi:
  { tags: ['ops'], security: [] }` in `app.route()` if you want them grouped
  and marked public.

---

[← Back to rAPId](../README.md)
