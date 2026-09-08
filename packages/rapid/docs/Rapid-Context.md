# The context and the application object

How a handler or middleware reaches every feature: what `ctx` carries on each
transport, how to read input, how to shape output, and what the `app` object
exposes. The [middleware catalog](./Rapid-Middleware.md) covers the onion;
the [configuration reference](./Rapid-Configuration.md) covers the options.

---

## TL;DR

- Every handler and middleware receives one context: `HTTPContext`,
  `SOCKETContext` or `JOBContext`. `ctx.type` tells them apart; the shared
  members behave identically on all three.
- **Input**: `ctx.args` (`params`, `query`, `paging`), `await ctx.payload`
  (the body), `ctx.headers` / `ctx.cookies` (HTTP), `ctx.connection`
  (sockets), `ctx.tick` (jobs).
- **Output**: return `{ content, status?, headers?, cookies?, redirect? }`
  or set `ctx.response`. `ctx.setHeader()`, `ctx.setCookie()`,
  `ctx.redirect()`, `ctx.serve()`, `ctx.sse()`, `ctx.html()` build the
  common shapes.
- **Identity and state**: `ctx.auth` (set once by an auth middleware),
  `ctx.state` (per invocation, from `app.state`), `ctx.requestId`.
- **Reaching out**: `ctx.config` (every other config set), `ctx.publish()`
  (push to socket subscribers from any transport), `inject()` from
  `@tundralibs/doctor` (this app's container), `app.log`.

---

## Shared members (every transport)

| Member                       | What it is                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.type`                   | `'HTTP' \| 'SOCKET' \| 'JOB'` — the discriminant for a `switch` or an `if`.                                                                                                                              |
| `ctx.requestId`              | The correlation id. Adopted from `headers.requestId` when safe, else minted. On every log line and every error body.                                                                                     |
| `ctx.action`                 | The invocation identity: the route pattern, the command name or the job name. On an unmatched HTTP request it is the raw pathname — attacker-controlled; check `ctx.matched` before using it as a label. |
| `ctx.args`                   | `{ params, query, paging }` — see [Reading input](#reading-input).                                                                                                                                       |
| `ctx.state`                  | The per-invocation state bag built from `app.state` per `stateMode`.                                                                                                                                     |
| `ctx.auth` / `setAuth()`     | The authenticated identity, `undefined` until an auth middleware sets it. Write-once: a second `setAuth` throws.                                                                                         |
| `ctx.status`                 | The interpreted outcome status (200 until set). Read this in observability code, not `response.status`.                                                                                                  |
| `ctx.response`               | The reply slot: set, override or clear (`null`) until `respond()`.                                                                                                                                       |
| `ctx.responded`              | Whether `respond()` has run. After it every mutation throws `RAPID_RESPONSE_INVALID`.                                                                                                                    |
| `ctx.config`                 | `app.config` — every config set besides `Application`, keyed by lowercased file name.                                                                                                                    |
| `ctx.publish(channel, data)` | Push to the channel's socket subscribers. Fire-and-forget; a no-op with no subscribers. Works from HTTP and jobs.                                                                                        |
| `ctx.detach(work)`           | Register abandoned-but-running work. The job transport waits for it so cronus's overlap guard stays held; the rejection is absorbed.                                                                     |
| `ctx.meter`                  | `app.meter` when `server.metrics` is on, else `undefined`.                                                                                                                                               |
| `ctx.app`                    | The owning `Application`.                                                                                                                                                                                |

## Reading input

### Parameters, query and paging — `ctx.args`

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'args' });

// GET /users/42?status=eq:active&sort=createdAt:desc&page=2&limit=20
app.get('/users/:id:', (ctx) => ({
  content: {
    id: ctx.args.params.id, // '42' — route params are strings
    filters: ctx.args.query.filters, // { status: { $eq: 'active' } }
    sorting: ctx.args.query.sorting, // [{ field: 'createdat', direction: 'DESC' }]
    page: ctx.args.paging, // { page: 2, size: 20, ... } — clamped, never throws
  },
}));
```

- **HTTP**: `params` are the route params (also `ctx.params`); `query` is
  parsed lazily on first read under the `server.query` caps — a breach is a
  400 `RAPID_QUERY_INVALID`; `paging` reads `page` and `pagelimit`/`limit`
  from the query or the two paging headers (the query wins) and clamps to
  `server.paging`.
- **SOCKET**: `params` **is** the frame payload, which must be a plain
  object (anything else is a 400); `query` is empty; `paging` honours
  `page`/`limit` keys in the payload.
- **JOB**: `params` = the job's registration `args` merged under
  `triggerJob(name, args)` overrides; `query` empty; `paging` defaults.

The query grammar: `field=value`, `field=op:value` for `eq ne gt gte lt lte
like ilike null in nin`, `field=[a,b]` for lists, `sort=field:desc` (and
`sort1`, `sort2` for order). Keys are lowercased. The result is untrusted: an
allow-list belongs in the handler or a `query(validate)` binder.

### The body — `ctx.payload`, `ctx.rawPayload`, `ctx.files`

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'body' });

app.post('/echo', async (ctx) => {
  const body = await ctx.payload; // JSON → object, form → object, text → string
  const bytes = await ctx.rawPayload; // the same bytes, for a digest
  return { content: { body, length: bytes?.byteLength ?? 0 } };
});
```

- `payload` parses once and caches the promise; concurrent readers share
  one read. JSON, `application/x-www-form-urlencoded` and multipart are
  parsed; other types arrive as text. Malformed JSON or form data is a 400;
  a body past `server.maxBodySize` is a 413.
- `rawPayload` is the bytes verbatim, read under the same cap. It is
  order-independent of `payload` (both come from one read), so a middleware
  that hashes the body can sit before or after one that parsed it. `null`
  when the request has no body.
- `files` lists the temp paths of uploaded parts once `payload` resolves;
  they are deleted after the response, so persist what you keep. Uploads are
  gated by `uploads.allowedExtensions` (empty by default — nothing accepted),
  `uploads.maxSize`, `uploads.maxFiles` and a magic-byte check.
- On **SOCKET**, `ctx.payload` is the frame's value, synchronous; awaiting
  it is a no-op, which is what keeps `await ctx.payload` uniform. **JOB** has
  no body (`undefined`).

### Headers, cookies, negotiation (HTTP)

- `ctx.headers` — the inbound `Headers`; `ctx.method`, `ctx.url`,
  `ctx.request` (the Fetch request).
- `ctx.cookies` — parsed once, percent-decoded, `Record<string, string>`.
- `await ctx.signedCookie(name)` — the bare value of a cookie set with
  `{ signed: true }`, or `undefined` when missing or forged. Signatures are
  bound to the cookie name. Needs the app `secret`.
- `ctx.accepts('application/json', 'text/html')` — q-value negotiation over
  `Accept`; `undefined` when nothing matches. The UI representer does **not**
  use it (its decision is the swap header and `prefer`).
- `ctx.remoteAddress` — the client address per `server.trustProxy`; `''`
  when none is trustworthy (private or loopback, or proxy headers not
  trusted). `ctx.remoteAddrList` is the observed hop chain.

### Where am I? (HTTP)

- `ctx.matched` — whether a route matched.
- `ctx.surface` — `'ui'` or `'api'`, decided before routing from
  `server.api` and `ui.enabled`.
- `ctx.basePath` — the api prefix that was stripped (`''` otherwise);
  `ctx.href('/posts')` prepends it so a link stays on the api surface.
  Redirects are never rewritten for you.
- `ctx.path` — the pathname the router saw (trailing slash normalised,
  prefix and path-mode version stripped). Compare against this, not
  `new URL(ctx.url).pathname`.
- `ctx.isSwap` — the representer's own decision for this request.
- `ctx.routeTemplate` — the resolved template options of a templated route.

### Sockets — `ctx.connection`

`ctx.connection` is the connection envelope captured at upgrade: `id`, the
upgrade `query` and the upgrade `headers` (where a token or cookie lives).
`ctx.connectionId`, `ctx.command` and `ctx.frameId` identify the frame.

### Jobs — `ctx.tick`

`ctx.job` is the name; `ctx.tick` is `{ scheduledAt, firedAt, count }`
(`count` is `-1` for a manual trigger); `ctx.drift` is the milliseconds
between the two dates.

## Shaping output

### The reply envelope

Return it, or assign it to `ctx.response`:

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'reply' });

app.get('/created', () => ({
  status: 201,
  content: { id: 1 }, // object → JSON; string → text; Uint8Array → bytes; stream → streamed
  headers: { location: '/items/1' },
}));
app.get('/none', () => ({ status: 204, content: '' }));
app.get('/go', () => ({ content: '', redirect: '/items' })); // 302
app.get('/moved', () => ({
  content: '',
  redirect: { url: '/items', permanent: true }, // 301
}));
```

- `status` defaults to 200 (204 for `null` content). `cookies` and
  `redirect` are HTTP-only and silently ignored by jobs and sockets, so a
  multi-transport method never branches.
- A redirect written as a path may not resolve to another origin (`//host`
  forms are refused with `RAPID_RESPONSE_INVALID`); write the full URL to
  leave the site on purpose.
- Setting `ctx.response` again **overrides**: `status` is kept unless the
  new value carries one, `headers` merge per key, `set-cookie` appends. This
  is what lets a post-processing middleware replace a body without
  resetting a 404 to 200 or wiping another middleware's headers.

### Helpers (HTTP)

| Helper                                                         | Produces                                                                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.setHeader(name, value)` / `appendHeader` / `deleteHeader` | Outbound headers, merged into the reply at finalize. Set before `next()` when a header must survive an error.                                              |
| `ctx.responseHeaders`                                          | A **copy** of the outbound headers (read only — mutating it does nothing).                                                                                 |
| `ctx.setCookie(name, value, options)`                          | Queued `Set-Cookie`, applied in call order at finalize; `{ signed: true }` uses the app `secret`.                                                          |
| `ctx.deleteCookie(name, { path, domain })`                     | An expiring `Set-Cookie`; pass the same path/domain the cookie was set with.                                                                               |
| `ctx.redirect(url, permanent?)`                                | A 302 (301 when permanent) reply object.                                                                                                                   |
| `ctx.serve(filePath, { download?, contentType?, status? })`    | Streams a file with a real `content-length`; 404 when missing. **No traversal guard** — trusted paths only; use `server.static` for request-derived paths. |
| `ctx.sse(asyncIterable)`                                       | A `text/event-stream` reply; a client disconnect cancels the source so an `async function*`'s `finally` runs.                                              |
| `ctx.html(string, status?)`                                    | A `text/html; charset=UTF-8` reply.                                                                                                                        |

### Streams

`content` may be a `ReadableStream<Uint8Array>` or any async iterable of
strings or bytes; it is streamed, never buffered. Streams are HTTP-only
(a job or socket reply rejects one at set time) and opaque to
body-inspecting middleware: `etag` skips them, `compress` pipes them.

## Identity and state

- **`ctx.auth`** is whatever the authenticating middleware stored: the pact
  adapter stores a `PactAuthContext` (`principal`, `via`); your own
  middleware stores what it verified. Read it in handlers, guards and the
  `idempotency` scope; it never reaches templates unless the UI `view`
  projection names fields.
- **`ctx.state`** is typed once by the app (`Application<S>`) and built per
  invocation from `app.state` by `stateMode`: `CLONE` (default — a deep copy;
  values that cannot be cloned are kept by reference), `PROTOTYPE`
  (`Object.create`, top-level writes shadow), `SHARE` (one object for every
  invocation — a middleware writing per-invocation values there must be
  wrapped with `markStateKeyUser()`, and the boot then refuses `SHARE`).
- **`ctx.config`** is the loaded config: `ctx.config.get('database.pool.max')`.
  The `Application` set is not in it (read the options with `app.option()`).

## Reaching services

- **`inject()`** from `@tundralibs/doctor` resolves against **this** app's
  container inside any handler, middleware or module method — even after an
  `await`, because the container rides the request's ambient scope.
  `app.container.stock(Label, value)` scopes a value to one app.
- **`app.log`** (and a module's `this.log`) is the slogger instance; every
  line written inside an invocation carries its `requestId` automatically.
- **`app.tracer`** is the tracer when configured; spans opened inside a
  handler nest under the invocation's span.

## The application object

| Member                                                                                                                | Purpose                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Application.initialize(source)`                                                                                      | The only constructor. Plain options, a directory path, or `{ path, env?, applicationSet?, ui? }`.      |
| `app.get/post/put/patch/delete(path, [options], ...mw, handler)` · `app.route(method, …)`                             | Register HTTP routes; `options` is `{ version?, template?, layout?, openapi? }`.                       |
| `app.socket(command, ...mw, handler)`                                                                                 | Register a websocket command on `server.socketPath`.                                                   |
| `app.channel(name, { authorize?, onSubscribe?, onUnsubscribe? })`                                                     | Declare a pub/sub channel; `authorize` runs on every subscribe.                                        |
| `app.publish(channel, data)`                                                                                          | Push to subscribers from outside a request.                                                            |
| `app.job(name, schedule, handler, { args? })`                                                                         | Register a cron job (5-field schedule, validated now).                                                 |
| `app.triggerJob(name, args?)`                                                                                         | Run a job now and return its outcome; bypasses the overlap guard and `jobs.enabled`.                   |
| `app.use(...middleware)`                                                                                              | Universal middleware, in order.                                                                        |
| `app.module(...instances)` · `app.modules({ modules, instances? })`                                                   | Mount decorated instances; boot the module system once (before start). `app.moduleRuntime` exposes it. |
| `app.onError(handler)`                                                                                                | One synchronous hook that may replace an error envelope.                                               |
| `app.start()` · `app.stop()` · `app.fetch(request, info?)`                                                            | Listen; drain and stop (`shutdownTimeout` seconds); serve one request with no listener.                |
| `app.address` · `app.port` · `app.running`                                                                            | Listener facts after `start()`.                                                                        |
| `app.option('server')` · `app.mode` · `app.state` · `app.config` · `app.secret`                                       | The resolved options, the state template, the other config sets, the signing key (throws when unset).  |
| `app.log` · `app.tracer` · `app.meter` · `app.metrics` · `app.socketMetrics` · `app.jobMetrics`                       | Observability handles.                                                                                 |
| `app.container` · `app.instanceId` · `app.cluster`                                                                    | The DI child container; the boot ULID; an optional cluster snapshot set by a control plane.            |
| `app.routes` · `app.socketCommands` · `app.jobs` · `app.channels` · `app.middlewares`                                 | Read-only registries (what OpenAPI and tooling read).                                                  |
| `app.uiEnabled` · `app.uiPrefer` · `app.uiOptions` · `app.apiSurface` · `app.staticMounts` · `app.assetVersion(path)` | The resolved UI and surface configuration.                                                             |
| `Application.requestIdGenerator`                                                                                      | Process-wide id factory; set once at startup.                                                          |

Registration closes at `start()` or the first `fetch()` for routes and
`app.use()`; `socket()` and `job()` close at `start()`. Registering after
that throws `RAPID_CONFIG` naming the call.

---

[← Back to rAPId](../README.md)
