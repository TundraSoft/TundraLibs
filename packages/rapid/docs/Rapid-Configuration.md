# Configuration

Every option `Application.initialize()` accepts — as the object you pass, or
as `configs/Application.yaml` when you pass a directory. For each key: its
type, default, unit, what validates it at boot, and which part of the
framework reads it. `rapid init` writes an annotated `Application.yaml`
carrying every key below.

---

## TL;DR

- Two shapes, one result: `initialize({ name, … })` (programmatic) or
  `initialize('./configs')` (a directory of config files; the
  `Application` set becomes the options, every other file stays readable as
  `app.config`). Both go through the same defaults and the same validation.
- **A bad value fails the boot**, never the first request: `initialize()`
  rejects with `RAPID_CONFIG` naming the key (the one check that needs the
  registered middleware — `SHARE` + `markStateKeyUser` — runs at `start()` /
  the first `fetch()`). `include` / `exclude` from `loadConfig` are
  forwarded untouched to filter which files in `path` become sets.
- **Durations are seconds** (`shutdownTimeout`, `logger.access.slow`,
  `server.static.*.maxAge`). **Sizes are bytes** (`server.maxBodySize`,
  `uploads.maxSize`).
- Group defaults merge under what you pass; the nested `paging` / `query` /
  `versioning` groups merge key-by-key too. `server.static`, `server.api` and
  `server.tls` replace wholesale.
- `mode` defaults to `PRODUCTION`. Local development wants `DEVELOPMENT` for
  readable logs and disclosed errors.

---

## Loading from a directory

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({
  path: './configs',
  env: true, // `${VAR}` placeholders from .env in `path` (or a directory holding one, or a path ending in .env)
  applicationSet: 'Application', // the file whose keys are the options
});
```

- A string path is shorthand for `{ path, env: true }`. **In the object
  form `env` defaults to no substitution** — pass `env: true`, a directory
  that holds a `.env`, or a file path that ENDS in `.env` (any other string is
  treated as a directory and silently loads nothing).
- Every `.yaml` / `.yml` / `.json` / `.toml` / `.js` file in `path` becomes a
  config set named by its **lowercased basename**; two files with the same
  basename fail the load. Keys inside a set are case-sensitive.
- `${VAR}` placeholders are replaced from the environment before parsing.
  **An unset placeholder is left as literal text** — `secret: ${APP_SECRET}`
  with no `APP_SECRET` is the 13-character string `${APP_SECRET}` and fails
  the 32-character check. Keep it commented until the variable exists.
- The `ui:` key of the application set is split off before the options are
  built — it is the UI's data half (see [UI](#ui)); code (templates, the
  `view` projection) can only come from the factory's `ui` option.
- Relative `server.static` roots resolve against the config directory.

## Top level

| Key               | Type                                | Default        | Validated at boot                              | Read by                                                                                                                          |
| ----------------- | ----------------------------------- | -------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | `string`                            | **required**   | non-empty, at most 30 characters               | the logger's `appName`, the tracer's `serviceName`, OpenAPI `info.title`, the listener                                           |
| `mode`            | `'DEVELOPMENT' \| 'PRODUCTION'`     | `'PRODUCTION'` | either value, any casing (normalised to upper) | error disclosure, default log level and console format, DEVELOPMENT response-contract checks, OpenAPI `expose`, asset re-hashing |
| `secret`          | `string`                            | none           | if present, at least 32 characters             | signed cookies, `session()`, `csrf()` — read when first used; absent then is a 500 `RAPID_CONFIG` on that request                |
| `stateMode`       | `'CLONE' \| 'PROTOTYPE' \| 'SHARE'` | `'CLONE'`      | one of the three                               | how `ctx.state` is built per invocation; `SHARE` + a `markStateKeyUser` middleware fails the boot                                |
| `shutdownTimeout` | integer **seconds**                 | `25`           | 1 to 30                                        | `stop()`: the drain window handed to both transports; a hard exit is armed at 1.1× it                                            |
| `headers`         | group                               | see below      |                                                |                                                                                                                                  |
| `server`          | group                               | see below      |                                                |                                                                                                                                  |
| `jobs`            | group                               | see below      |                                                |                                                                                                                                  |
| `uploads`         | group                               | see below      |                                                |                                                                                                                                  |
| `logger`          | group                               | see below      |                                                |                                                                                                                                  |
| `tracer`          | group                               | absent         |                                                |                                                                                                                                  |
| `ui`              | group                               | see below      |                                                |                                                                                                                                  |

`mode` is the one knob most worth understanding: in PRODUCTION every 500
reads `Internal server error` and `debug` never leaves the process; in
DEVELOPMENT the thrown message, `details` and `debug` are all in the body.
See [Errors](./Rapid-Errors.md).

## `headers`

Names of the headers the core stamps on every response. One place, so
custom middleware and clients share them.

| Key             | Type                   | Default             | Validated                          | Read by                                                                                                                                                           |
| --------------- | ---------------------- | ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestId`     | header name            | `'x-request-id'`    | RFC 9110 token; `false` is refused | inbound: adopted as the correlation id when it matches `[A-Za-z0-9._-]{1,64}`, else one is minted; outbound: stamped on every response, including 404s and errors |
| `requestIdEcho` | list of header names   | `[]`                | each a token                       | the same id stamped under each extra name (`x-correlation-id` for a gateway)                                                                                      |
| `responseTime`  | header name or `false` | `'x-response-time'` | token, or `false` to omit          | `<ms>ms` stamped as the last header before the response leaves                                                                                                    |

The id generator is `Application.requestIdGenerator` (a shared
`sequenceID()` by default); set it once at startup for a different scheme.

## `server`

| Key                   | Type                           | Default                   | Validated                                                                                       | Read by                                                                                                                                      |
| --------------------- | ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`             | `boolean`                      | `true`                    | —                                                                                               | `start()` — whether this replica listens. `fetch()` ignores it                                                                               |
| `port`                | integer                        | `8008` (compat's default) | 0 to 65535; `0` = OS-assigned (`app.port` reads it back)                                        | the listener                                                                                                                                 |
| `hostname`            | `string`                       | `'localhost'` (compat's)  | —                                                                                               | the listener                                                                                                                                 |
| `unixSocketPath`      | `string`                       | none                      | non-empty; exclusive with `port` / `hostname`                                                   | the listener (UNIX mode; `tls` is not applied there)                                                                                         |
| `tls`                 | compat `TLSOptions`            | none                      | by compat at listen: inline `cert`/`key`/`ca` **or** `certFile`/`keyFile`/`caFile`, never mixed | the TCP listener                                                                                                                             |
| `trustProxy`          | `boolean` or integer hop count | `false`                   | boolean or non-negative integer                                                                 | `ctx.remoteAddress` (`x-forwarded-for` / `x-real-ip`, rightmost trusted hop), and `x-forwarded-host` with `api.trustForwardedHost`           |
| `maxBodySize`         | integer **bytes**              | `1048576` (1 MB)          | non-negative; `0` disables                                                                      | `ctx.payload` / `ctx.rawPayload` — enforced on bytes actually read (413 past it)                                                             |
| `metrics`             | `boolean` or per-family object | `false`                   | boolean, or an object of known family booleans                                                  | creates `app.meter` (a metro-man registry, see [families](#servermetrics--metric-families)); the `metrics()` endpoint answers 503 without it |
| `autoHead`            | `boolean`                      | `true`                    | —                                                                                               | a `HEAD` route synthesised for every `GET` that has none                                                                                     |
| `methodNotAllowed`    | `boolean`                      | `false`                   | —                                                                                               | `405` + `Allow` (and `OPTIONS` → 204) instead of `404` when the path exists for other methods                                                |
| `ignoreTrailingSlash` | `boolean`                      | `true`                    | —                                                                                               | `/users/` routes as `/users` (stripped before surface and version resolution)                                                                |
| `socketPath`          | path                           | `'/ws'`                   | starts with `/`                                                                                 | the websocket upgrade path (mounted only when commands or channels exist); the api prefix is stripped first                                  |
| `socketOrigins`       | list of serialized origins     | `[]` (same-origin only)   | each `scheme://host[:port]`, lowercase                                                          | browser upgrades: an `Origin` that is neither the request's own host nor listed is refused                                                   |
| `api`                 | group                          | none                      | see below                                                                                       | the api surface                                                                                                                              |
| `static`              | map                            | none                      | see below                                                                                       | framework-side static files                                                                                                                  |
| `paging`              | group                          | see below                 |                                                                                                 |                                                                                                                                              |
| `query`               | group                          | see below                 |                                                                                                 |                                                                                                                                              |
| `versioning`          | group                          | see below                 |                                                                                                 |                                                                                                                                              |

### `server.metrics` — metric families

`true` records every family; the object form switches families off
(`{ bodies: false, ui: false }`). A family that is off declares no series,
so it never appears in a scrape, and its recorders are one boolean check.
With `metrics: false` no meter exists and nothing is checked at all. Every
counter ends in `_total`; durations are millisecond histograms; labels are
the route or command pattern, an error code, a job or channel name — never
a raw path, message or id.

| Family       | Series                                                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requests`   | `rapid_requests_total{transport,action,status}`, `rapid_request_duration_ms{transport,action}` (same clock as `x-response-time` and the access line), `rapid_requests_in_flight{transport}`, `rapid_errors_total{transport,action}` (5xx)                   |
| `errors`     | `rapid_error_codes_total{code,transport}` — every disclosed `RAPID_*` code                                                                                                                                                                                  |
| `jobs`       | `rapid_job_runs_total{job,outcome}` (`ok`, `failed`, `skipped`, `overlap`), `rapid_job_duration_ms{job}`, `rapid_job_drift_ms{job}`                                                                                                                         |
| `sockets`    | `rapid_socket_upgrades_total{result}`, `rapid_channel_subscriptions_total{channel,event}` (`subscribed`, `unsubscribed`, `refused`), `rapid_channel_publishes_total{channel}`                                                                               |
| `middleware` | `rapid_middleware_events_total{middleware,event,action}` — `rateLimit rejected`, `idempotency replayed/in_flight/mismatch/released`, `session loaded/missed/saved/touched/regenerated/destroyed`, `csrf rejected`, `timeout fired`, `compress gzip/deflate` |
| `bodies`     | `rapid_request_bytes_total{transport}` (bytes actually read), `rapid_uploads_total`                                                                                                                                                                         |
| `ui`         | `rapid_representations_total{kind}` (`json`, `fragment`, `page`, `redirect`), `rapid_static_requests_total{event}` (`hit`, `not_modified`, `range`, `unsatisfiable`, `miss`)                                                                                |

Register your own metrics on `app.meter.registry` (a metro-man `MetroMan`);
they are served by the same `metrics()` endpoint.

### `server.api` — the api surface

Requests that address the api surface get JSON only: pages, static files
and the UI runtime scripts do not exist there (a byte-identical 404).

| Key                  | Type              | Default | Validated                                                       | Read by                                                                           |
| -------------------- | ----------------- | ------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `hosts`              | list of hostnames | none    | bare hostnames (no scheme/path); normalised lowercase, punycode | surface by `Host` (or `x-forwarded-host`, see below)                              |
| `prefix`             | path              | none    | `/api`-shaped: leading slash, no trailing slash                 | surface by path; the prefix is stripped before routing and becomes `ctx.basePath` |
| `trustForwardedHost` | `boolean`         | `false` | boolean                                                         | read `x-forwarded-host` for the host match — only with `trustProxy` > 0           |

At least one of `hosts` / `prefix` is required when the group is present.
Without the group, and with the UI enabled, everything is the `ui` surface;
with the UI disabled everything is `api`.

### `server.static` — static files

A map of URL prefix → directory (or an entry object). Served on route
**miss**, `GET`/`HEAD`, `ui` surface only; routes always win.

| Entry key     | Type                | Default        | Validated         | Behaviour                                                                                         |
| ------------- | ------------------- | -------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| _(map key)_   | URL prefix          | —              | starts with `/`   | trailing slashes trimmed                                                                          |
| `root`        | directory           | **required**   | non-empty         | relative paths resolve against the config directory                                               |
| `index`       | filename or `false` | `'index.html'` | string or `false` | served for `/` and directory hits                                                                 |
| `maxAge`      | integer **seconds** | none           | 0 to 31536000     | `cache-control: public, max-age=<n>`                                                              |
| `fingerprint` | `boolean`           | `false`        | boolean           | a `?v=` URL gets `immutable` caching (one year); `view.asset()` hashes the file to build that URL |

Traversal (`..`, encoded or not) and symlinks escaping the root are refused;
weak ETags with 304s, `Last-Modified`, single byte ranges with `If-Range`,
streamed bodies. **There is no dotfile rule** — do not put a `.env` under a
served root. On Cloudflare Workers there is no filesystem: every mount
declines silently (404).

### `server.paging`

Resolved from the `page` and `pagelimit` (or `limit`) query parameters, or
the two headers; the query wins. Invalid values are ignored and both numbers
are clamped — paging never throws.

| Key           | Type        | Default           | Validated                   |
| ------------- | ----------- | ----------------- | --------------------------- |
| `pageHeader`  | header name | `'x-page-number'` | —                           |
| `sizeHeader`  | header name | `'x-page-size'`   | —                           |
| `defaultSize` | integer     | `10`              | positive, at most `maxSize` |
| `maxSize`     | integer     | `1000`            | positive                    |
| `maxPage`     | integer     | `1000`            | positive                    |

### `server.query`

Denial-of-service caps on the query-string parser. Enforced lazily, on the
first read of `ctx.args.query`; a breach is `RAPID_QUERY_INVALID` (400).

| Key              | Type    | Default | Meaning                         |
| ---------------- | ------- | ------- | ------------------------------- |
| `maxFilters`     | integer | `50`    | distinct filter fields          |
| `maxSorts`       | integer | `5`     | sort instructions               |
| `maxValueLength` | integer | `2048`  | characters per value            |
| `maxArrayItems`  | integer | `100`   | items in a `field=[a,b,c]` list |

All four must be positive integers.

### `server.versioning`

| Key          | Type                             | Default                                                                                                | Validated                             |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `mode`       | `'header' \| 'accept' \| 'path'` | `'header'`                                                                                             | one of the three                      |
| `identifier` | `string`                         | `'x-api-version'` (header) · `''` (accept — no version ever resolves) · `'^/(v[0-9]+)(?=/\|$)'` (path) | in `path` mode the regex must compile |
| `default`    | version string                   | none                                                                                                   | —                                     |

`path` mode strips the matched segment before routing (after the api prefix
comes off). `default` applies to requests that carry no version — it is not
a fallback for an unrecognised one.

## `jobs`

| Key       | Type      | Default | Read by                                                                             |
| --------- | --------- | ------- | ----------------------------------------------------------------------------------- |
| `enabled` | `boolean` | `true`  | `start()` — whether this replica runs the cron scheduler. `triggerJob()` ignores it |

There is no leader election: every replica with `jobs.enabled` runs every
job. Schedules are evaluated against the server's local time, once per
minute; a still-running job's next tick is skipped, never queued.

## `uploads`

| Key                 | Type              | Default                              | Validated                                | Read by                                                                         |
| ------------------- | ----------------- | ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `path`              | directory         | a `rapid-*` temp dir created at boot | —                                        | where file parts land (`<ulid><ext>`); an owned temp dir is removed at `stop()` |
| `maxSize`           | integer **bytes** | `10485760` (10 MB)                   | positive                                 | per-file cap (413)                                                              |
| `maxFiles`          | integer           | `20`                                 | positive                                 | file parts per request, counted before any byte is written (413)                |
| `allowedExtensions` | list              | `[]` — **nothing accepted**          | each lowercase and dot-prefixed (`.png`) | the allow-list (415); known types are also sniffed by magic bytes               |

A multipart request is read up to `max(server.maxBodySize, uploads.maxSize)`
only when `allowedExtensions` is non-empty. On Cloudflare Workers and in the
browser no directory exists and a file part fails with
`RAPID_UPLOADS_UNAVAILABLE` (501); text-only forms still parse.

## `logger`

The `@tundralibs/slogger` options minus `appName` and `contextProvider`,
which rapid owns, plus `access`.

| Key                  | Type                                       | Default                                                               | Notes                                                                                                                            |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `level`              | syslog severity **number**                 | `7` (DEBUG) in DEVELOPMENT, `6` (INFO) in PRODUCTION                  | 0 EMERGENCY · 1 ALERT · 2 CRITICAL · 3 ERROR · 4 WARNING · 5 NOTICE · 6 INFO · 7 DEBUG. Names are not accepted                   |
| `handlers`           | list of handler configs                    | one `ConsoleHandler` at `level`, `formatter: 'logfmt'` in DEVELOPMENT | `{ name, type, level, formatter?: 'standard' \| 'logfmt' \| 'json' \| 'compact' }` — data-expressible when `formatter` is a name |
| `sampling`           | `{ sampleRate?, bypassSamplingForLevel? }` | none                                                                  | passed through to slogger                                                                                                        |
| `interpolateMessage` | `boolean`                                  | slogger's default                                                     | passed through                                                                                                                   |
| `access`             | group                                      | see below                                                             |                                                                                                                                  |

### `logger.access`

One line per HTTP request, socket frame and job firing, written after the
response is finalised (so it reports the status actually sent).

| Key       | Type               | Default | Validated                                  | Meaning                                                                                   |
| --------- | ------------------ | ------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `enabled` | `boolean`          | `true`  | —                                          | the access line only — error disclosure logging (5xx at `error`, 4xx at `debug`) stays on |
| `skip`    | list of paths      | `[]`    | each starts with `/`; `'/x/*'` is a prefix | routed HTTP paths never logged; sockets and jobs are never skipped                        |
| `slow`    | number **seconds** | none    | positive, fractions allowed                | past it the line is a `warn` carrying `slow: true`                                        |
| `client`  | `boolean`          | `false` | —                                          | add `remoteAddress`, `userAgent`, `referer` — personal data, so opt in                    |

Line: `GET /users 200 12ms` with fields `type`, `action`, `status`, `ms`,
`code` (when the chain threw), `matched` and `surface` (HTTP), `drift`
(jobs), and `requestId` from the ambient scope. Levels: 5xx → `error`, 4xx →
`warn` (an unmatched 404 stays `info`), else `info`.

## `tracer`

Opt-in. Absent means no tracer and zero overhead. Present, it wraps every
invocation's middleware onion in a span (`SERVER` on HTTP), honours an
inbound `traceparent`, and composes trace ids onto every log line.

| Key                      | Type                                                                                        | Default | Validated                          | Notes                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------- | ---------------------------------- | ------------------------------------------------------- |
| `exporter`               | `{ type: 'CONSOLE' }` \| `{ type: 'OTLP', baseURL, headers? }` \| a `SpanExporter` instance | none    | `type` must be `CONSOLE` or `OTLP` | the descriptor is data (YAML-able); an instance is code |
| `resource`               | attribute map                                                                               | none    | —                                  | data                                                    |
| `sampler`, `idGenerator` | tracer objects                                                                              | none    | —                                  | code only                                               |

## `ui`

The UI layer has a **data half** (below — YAML-able, boot-validated as a
closed key set) and a **code half** (`core`, `layout`, `view`,
`errorTemplate` / `errorTemplates`, `assets`) that only the factory's `ui`
option can carry. A code key in YAML fails the boot with a message naming it.

| Key              | Type                 | Default            | Validated                                                     | Read by                                                                                                          |
| ---------------- | -------------------- | ------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `enabled`        | `boolean`            | `true`             | boolean                                                       | `false` = never emit HTML: pages 404, no runtime routes, every request is `api`                                  |
| `prefer`         | `'json' \| 'html'`   | `'json'`           | either                                                        | the default representation of a templated route without a swap header                                            |
| `runtimePath`    | path                 | `'/__rapid/ui.js'` | starts with `/`; must not collide with the live/history paths | where the swap runtime is served                                                                                 |
| `live`           | `boolean`            | `false`            | boolean                                                       | serve `/__rapid/live.js` (the websocket push bridge); warned on the `fetch()`-only path                          |
| `history`        | `boolean`            | `false`            | boolean                                                       | serve `/__rapid/history.js` (push-state navigation)                                                              |
| `csrfCookie`     | cookie name          | `'csrf'`           | token                                                         | the cookie the runtime echoes as `x-csrf-token`; also marks identity-bearing replies as `cache-control: private` |
| `swapHeader`     | header name          | `'rapid-swap'`     | token                                                         | a request carrying it gets the fragment                                                                          |
| `swapUnless`     | list of header names | `[]`               | each a token                                                  | headers whose presence cancels the swap (htmx's `HX-Boosted`)                                                    |
| `redirectHeader` | header name          | `'rapid-redirect'` | token                                                         | a swap reply's redirect target (`HX-Redirect` for htmx)                                                          |

Full behaviour in [UI](./Rapid-UI.md).

## Reading configuration back

- `app.option('server')` / `app.mode` / `app.port` — the resolved options.
- `app.config` (also `ctx.config`, a module's `this.config`) — every other
  config set: `config.get('database.pool.max')`, set name lowercased.
- The `config('set.key')` binder injects a value into a decorated method.
- `Application.yaml` is the application set; keep secrets in `.env` and
  reference them as `${VAR}`.

---

[← Back to rAPId](../README.md)
