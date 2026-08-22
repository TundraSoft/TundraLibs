# rAPId

A cross-runtime API framework for Deno, Bun, Node.js, Cloudflare Workers, and
the browser. One application object registers HTTP routes, WebSocket (RPC)
commands, and cron jobs, and runs them through a single universal
middleware/context cycle — assembled either Oak-style from functions
(`app.get(...)`, `app.use(...)`, `app.job(...)`) or from decorated classes
(`@Module`/`@GET`/`@SOCKET`/`@JOB`). Observability is built in: structured
logging (`@tundralibs/slogger`) is always on with per-request correlation,
distributed tracing (`@tundralibs/tracer`) and metrics (`@tundralibs/metro-man`)
are opt-in, and the transport layer is an adapter so the same app serves from a
listening server (`app.start()`) or a fetch handler (`app.fetch(request)`).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

> Early development (`0.0.0`). The API described here is real and verified
> against source, but pre-1.0 — expect movement.

## Installation

**Deno:**

```bash
deno add @tundralibs/rapid
```

**Bun:**

```bash
bunx jsr add @tundralibs/rapid
```

**Node.js:**

```bash
npx jsr add @tundralibs/rapid
```

## Quick start

`Application.initialize()` is the **only** way to make an app — the constructor
is private, so an app is always built the same way and can never silently skip
its config. It's async (config loading is), and takes either plain options or a
config directory. Register a couple of routes and start the listener:

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'hello' });

// A handler either RETURNS the response payload or sets `ctx.response`.
app.get('/', () => ({ content: { message: 'hello world' } }));
app.get('/users/:id:', (ctx) => ({ content: { id: ctx.params.id } }));

await app.start();
console.log(`listening on ${app.address}`);
```

Passing plain options is the **programmatic** shape (tests, scripts) — nothing
is read from disk. In production, hand `initialize` a **config directory**
instead: the set named `Application` (`Application.yaml`/`.json`/…) becomes the
application options, and every other set (a database config, your own settings)
stays readable via `app.config`.

Given `configs/Application.yaml`:

```yaml
name: my-api
mode: PRODUCTION
server:
  port: 8008
  hostname: 0.0.0.0
  # ${VAR} references are interpolated from the environment / .env
  tls:
    key: ${TLS_KEY_PATH}
shutdownTimeout: 10000
```

```ts
import { Application } from '@tundralibs/rapid';

// String form: load ./configs, with .env interpolation on by default.
const app = await Application.initialize('./configs');
app.config.get<string>('database.host'); // any other set, as loaded
await app.start();
```

The object form takes finer control — a different env source and a different
application file name:

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({
  path: './configs',
  env: '.env.production', // true | false | a path (default: true)
  applicationSet: 'Api', // read Api.yaml instead of Application.yaml
});
await app.start();
```

Either shape yields the same `Application`, so everything below applies whether
you passed options or loaded from config.

`name` is required (it is also the logging `appName`, max 30 chars). Common
options: `mode` (`'DEVELOPMENT'` | `'PRODUCTION'`, default `'PRODUCTION'` —
controls error disclosure and log level), `server`, `jobs`, `uploads`, `logger`,
`tracer`, `stateMode`, and `shutdownTimeout`.

## Routing

Paths are [`@tundralibs/radrouter`](https://jsr.io/@tundralibs/radrouter)-native:
route parameters are **colon-wrapped** (`/users/:id:`, not express-style
`:id`). The five verb helpers (`get`/`post`/`put`/`patch`/`delete`) and the
generic `route(method, path, ...)` all take an optional chain of route-scoped
middleware followed by the handler last.

### Versioning

API versioning is a dimension separate from the path. Configure how the inbound
version is resolved on `server.versioning`, then tag routes with a `version`:

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({
  name: 'api',
  server: {
    // mode: 'header' | 'accept' | 'path'
    versioning: { mode: 'header', identifier: 'x-api-version', default: 'v1' },
  },
});

// A request with no version header resolves to the `default` (v1).
app.route('GET', '/report', () => ({ content: { shape: 'v1' } }));
// Same path, explicit version slot — matched only for v2.
app.route('GET', '/report', { version: 'v2' }, () => ({
  content: { shape: 'v2', _new: true },
}));
```

`mode: 'header'` reads the `identifier` header; `'accept'` matches an
`application/vnd.<identifier>.<version>+…` media type; `'path'` treats
`identifier` as a capture regex over a leading path segment (stripped before
routing). On the decorator API the same slot is set with `@GET(path, { version })`
(and a module-wide default via `@Module({ version })`).

## Middleware

`app.use(...)` registers **universal** middleware — the outer onion, in order,
on every transport's invocation cycle (HTTP requests, socket frames, and job
firings alike). Narrow to a transport inside the middleware via `ctx.type`, or
use the scope helpers. Route- and command-scoped middleware are passed inline
before the handler.

```ts
import { Application } from '@tundralibs/rapid';
import {
  cors,
  requestId,
  requestLogger,
  responseTimer,
  secureHeaders,
} from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'api' });

app.use(
  requestLogger(),
  responseTimer(),
  secureHeaders(),
  cors(),
  requestId(),
);
```

Shipped middleware factories (all exported from the root and from
`@tundralibs/rapid/middlewares`): `cors`, `secureHeaders`, `compress`, `etag`,
`rateLimit`, `requestId`, `requestLogger`, `responseTimer`, `serveStatic`,
`timeout`, and `healthCheck`.

Scope helpers turn a transport-specific middleware into a universal one:
`onlyHTTP` / `onlySOCKET` / `onlyJOB` run it only on that transport (a no-op
elsewhere), while `guardHTTP` / `guardSOCKET` / `guardJOB` run it there and
**block** other transports (fail-closed — the right choice for auth):

```ts
import { Application } from '@tundralibs/rapid';
import { guardHTTP, timeout } from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'api' });
app.use(guardHTTP(timeout(5000)));
```

## Modules

For larger apps, group routes/commands/jobs on decorated classes. Decorators are
metadata-only (TC39 standard) — they never wrap the method. Mount a decorated
instance with `app.module(instance)`:

```ts
import { Application } from '@tundralibs/rapid';
import { GET, Module, param } from '@tundralibs/rapid/decorators';
import type { RapidContextResponse } from '@tundralibs/rapid';

@Module('Users', { prefix: '/users' })
class Users {
  @GET('/:id:', { bind: [param('id')] })
  find(id: string): RapidContextResponse {
    return { content: { id } };
  }
}

const app = await Application.initialize({ name: 'demo' });
app.module(new Users());
```

`@Module` adds an HTTP `prefix` (paths only), a `namespace` (joined onto the flat
`@SOCKET`/`@JOB` names), and a default route `version`. Argument binders
(`param`, `query`, `payload`, `paging`, `header`, `connection`) type the method
signature via the decorator's `bind` tuple.

Decorations are recorded by method **name** in the class's TC39 decorator
metadata, so they compose freely with third-party decorators — a wrapping
decorator (a timer, retry, cache) may sit above or below a rapid one; the route
binds whatever function ends up installed under that name. `Symbol.metadata`
is polyfilled by rapid itself at load time (idempotent, the standard
`Symbol.for('Symbol.metadata')` fallback), so nothing is required of you.

The richer `RapidModule` tier adds a lifecycle, a scoped logger, typed
`emit`/`invoke`, and event wiring. Boot it **once** with
`app.modules({ modules: [...] })` (before `start()`/`fetch()`); `stop()` disposes
it in reverse order. See `examples/` for a full module-based app.

## Dependency injection

Each `Application` owns `app.container` — a child of the global
[`@tundralibs/doctor`](https://jsr.io/@tundralibs/doctor) `Doctor`. It reads the
global's registrations but holds its own instances, so two apps in one process
never share module instances. An `inject()` inside a handler resolves against
**this** app's container — even after an `await`, because the container rides the
request's async context. `stock()` an override to scope a fake or a per-app
implementation to one app alone:

```ts
import { Application } from '@tundralibs/rapid';
import { inject, label } from '@tundralibs/doctor';

const Clock = label<{ now(): string }>('Clock');

const app = await Application.initialize({ name: 'di-demo' });
app.container.stock(Clock, { now: () => new Date().toISOString() });

// Resolves against app.container, not the process-wide Doctor.
app.get('/time', () => ({ content: { at: inject(Clock).now() } }));
```

Module classes registered as `@Vial` are dispensed from the container too — one
instance per app, read-through to the global registration — and a plain
`RapidModule` that calls `inject()` in a field initializer resolves against the
same container when the module system boots.

## Validation

A bound validator (`bind: [payload(schema.parse)]`) that **throws** turns the
request into a **400** — but only if rapid can tell the throw is a _validation_
failure, not a server bug. The rule, in order of precedence:

1. **You throw a `RapidError` yourself** → used verbatim (full control over code
   / status / detail).
2. **A `@tundralibs/guardian` failure** → **automatic 400** (`RAPID_VALIDATION_FAILED`,
   with a client-safe message per failing field). Guardian is this repo's
   validator, recognized structurally — no wrapper, no import needed.
3. **Any other throw** (zod, a hand-written `parse`, …) → an opaque **500** by
   default. Wrap the validator in **`validated()`** to opt its throws into a 400:

```ts ignore
import { validated } from '@tundralibs/rapid';
import { z } from 'zod'; // any validator with a .parse

const Body = z.object({ email: z.string().email() });

class Users {
  // guardian: no wrapper needed — a failure is already a 400.
  // zod / custom: wrap in validated() or an unexpected throw is a 500.
  @POST('/', { bind: [payload(validated(Body))] })
  create(body: unknown): RapidContextResponse {
    return { content: body };
  }
}
```

> The asymmetry is deliberate: guardian is first-class, everything else is
> explicit. If you validate **server-side** data with guardian and a failure
> should _not_ be a client 400, catch it and throw your own error.

## Streaming responses

A handler's `content` can be a string, a plain object (serialized as JSON), a
`Uint8Array` — or a **stream**: a `ReadableStream<Uint8Array>` or any async
iterable of chunks (strings are UTF-8 encoded). A stream body is handed to the
client as-is, never buffered, so large files, server-sent events, and proxy
passthrough don't hold the body in memory. `ctx.serve()` and `serveStatic`
stream files this way (with a real `content-length` from the file's size), and
`serveStatic` honours a single-range `Range: bytes=…` header — `206` with
`Content-Range`, or `416` when the range lies outside the file — so clients
can resume downloads and seek media.

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'stream' });

// Any async iterable streams — a generator, a DB cursor, another fetch's body.
app.get('/lines', () => ({
  content: (async function* () {
    for (let i = 0; i < 3; i++) yield `line ${i}\n`;
  })(),
  headers: { 'content-type': 'text/plain' },
}));

// Server-Sent Events: `ctx.sse()` frames each event and sets text/event-stream.
app.get('/events', (ctx) =>
  ctx.sse((async function* () {
    yield { event: 'tick', data: { n: 1 } };
    yield { event: 'tick', data: { n: 2 } };
  })()));
```

A client disconnect cancels the stream, which returns the source iterator — so
an `async function*`'s `finally` block runs and is the place to unsubscribe or
release a cursor. Stream bodies are HTTP-only (a job or socket reply rejects
one) and opaque to body-inspecting middleware: `etag` skips them (a content
hash would need the whole body) and `compress` pipes them chunk-wise.

## Endpoints

Ready-made handlers you mount where you like — nothing is auto-registered:

```ts
import { Application } from '@tundralibs/rapid';
import { health, metrics, openapi } from '@tundralibs/rapid/endpoints';

const app = await Application.initialize({
  name: 'api',
  server: { metrics: true },
});

app.get('/healthz', health({ check: () => Promise.resolve() }));
app.get('/metrics', metrics()); // 503 unless server.metrics is on
app.get('/openapi.json', openapi());
```

- `health({ check })` — liveness/readiness; the `check` throws/rejects to report
  503, else 200.
- `metrics({ format })` — serves `app.meter` as Prometheus text (default) or
  JSON; returns 503 when `server.metrics` is off.
- `openapi({ info, servers, expose })` — the assembled OpenAPI 3.0.3 document
  built from the mounted routes (cached per version).
- `login({ pact, strategy })` — logs a user in through a `@tundralibs/pact`
  instance and returns the token + principal (pact is a type-only import, so it
  adds no runtime dependency until you pass an instance):

```ts ignore
import { login } from '@tundralibs/rapid/endpoints';
app.post('/login', login({ pact: myPactInstance }));
```

## Auth

rAPId owns only the auth bag (`ctx.auth`); the auth middleware are optional and
take your own logic. `authenticate({ verify })` identifies the caller and fills
`ctx.auth` (it never rejects — anonymous requests flow through); `authorize(check)`
enforces (401 when `ctx.auth` is absent, 403 when `check` returns falsy):

```ts
import { Application } from '@tundralibs/rapid';
import { authenticate, authorize } from '@tundralibs/rapid';

const app = await Application.initialize({ name: 'api' });

app.use(
  authenticate({
    verify: (token) => token === 'secret' ? { id: 'u1', role: 'admin' } : null,
  }),
);

app.get(
  '/admin',
  authorize((auth) => auth.role === 'admin'),
  () => ({ content: { ok: true } }),
);
```

The `jwt(pact)` and `permission(perms, module, perm)` helpers build a `verify`
and an `authorize` check from a `@tundralibs/pact` instance (again type-only —
no runtime dependency until passed).

## Cookies, sessions & CSRF

One application `secret` (≥ 32 chars, HMAC via `@tundralibs/crypt`) backs
everything that signs a cookie. Source it from the environment — never commit
it — and set it once:

```yaml
# configs/Application.yaml
name: my-api
secret: ${APP_SECRET}
```

A **signed cookie** is tamper-evident: the client can read it but cannot alter
it without invalidating the signature. Set one with `{ signed: true }` (async —
`await` it) and read it back with `ctx.signedCookie()`, which returns the bare
value or `undefined` for a missing or forged cookie:

```ts
import { Application } from '@tundralibs/rapid';

const app = await Application.initialize({
  name: 'api',
  secret: 'replace-with-at-least-32-random-characters',
});

app.get('/prefs', async (ctx) => {
  await ctx.setCookie('theme', 'dark', { signed: true, httpOnly: true });
  return { content: { theme: (await ctx.signedCookie('theme')) ?? null } };
});

// A handler may also RETURN cookies — plain or signed — and a redirect on
// the reply itself: a string → 302, `{ url, permanent: true }` → 301.
app.get('/login', () => ({
  content: '',
  cookies: [{ name: 'sid', value: 'abc', options: { signed: true } }],
  redirect: '/dashboard',
}));
```

The reply `cookies` and `redirect` keys are **HTTP-only**: the HTTP context
consumes them, and a job or socket reply **silently ignores** them (a job has
no cookies, and a redirect never becomes a 3xx there). So a module method
decorated for several transports can return them without branching on the
transport.

`session()` — store-backed, per-client state across requests, keyed by a
signed id cookie with a rolling idle TTL and a hard absolute cap; call
`regenerate()` on login (rotates the id, keeps the data) and `destroy()` on
logout. `csrf()` — a stateless signed double-submit token; state-changing
requests must echo the token cookie back in `x-csrf-token` (or a form field)
or get a 403. Both sign with the app `secret`, so neither takes one of its own.
A signing feature used without a configured `secret` fails loudly with
`RAPID_CONFIG` rather than silently emitting an unsigned cookie.

## Observability

- **Logging is always on.** `app.log` is a `@tundralibs/slogger` instance whose
  `appName` is your `name`; the framework owns the context provider so every log
  line carries the per-request correlation id (via `@tundralibs/ambient`).
  Default level is `INFO` in production, `DEBUG` in development.
- **The correlation id is yours to shape.** A validated inbound `x-request-id`
  is adopted; otherwise one is minted by the process-wide
  `Application.requestIdGenerator` — by default a crypto-free, monotonic
  `sequenceID` (a correlation id never needed a CSPRNG, and this is ~10× cheaper
  than a ULID). Set it once to choose a different scheme; the setter calls the
  generator and rejects it at assignment unless it returns a safe non-empty
  string:

  ```ts
  import { Application } from '@tundralibs/rapid';
  import { ulid } from '@tundralibs/id';

  Application.requestIdGenerator = ulid; // sortable ids instead of sequential
  ```
- **Tracing is opt-in.** Pass a `tracer` option and rAPId emits a SERVER span per
  request (honouring an inbound `traceparent`), propagates on outbound calls, and
  composes trace ids onto every log line. Read it via `app.tracer`.
- **Metrics are opt-in.** Set `server.metrics: true` and the invocation cycle
  records into a `@tundralibs/metro-man` meter (`app.meter`) plus server counters
  (`app.metrics`, `app.socketMetrics`); serve them with the `metrics()` endpoint.
  Cron statistics (`app.jobMetrics`) are tracked unconditionally.

## Graceful shutdown

`app.stop()` drains in-flight HTTP requests before closing. `shutdownTimeout`
(default `25_000` ms) is the drain window: in-flight requests get up to that long
to finish, then whatever is left is force-closed — WebSockets don't drain, so
they are held to the deadline and then dropped. Jobs stop and the module runtime
disposes (reverse init order) around the drain. A process-exit backstop fires a
little past the window (`shutdownTimeout × 1.1`, unref'd) only if teardown itself
wedges; `shutdownTimeout: 0` disables both — an immediate force-close with no
exit.

```ts
import { Application } from '@tundralibs/rapid';

// Give in-flight requests up to 10s to finish on stop(), then force-close.
const app = await Application.initialize({
  name: 'api',
  shutdownTimeout: 10_000,
});
```

Call `stop()` from your platform's termination signal (a `SIGTERM` handler on
Deno/Bun/Node) for zero-drop rolling deploys.

## Testing

`@tundralibs/rapid/testing` re-exports the `@tundralibs/compat/test` lifecycle
(`describe`/`it`/`beforeAll`/…) and adds `client()` — a JSON-in/out client that
drives routes through `app.fetch` with no port — and `harness()`, which boots the
module system with stubbed dependencies.

```ts
import { Application } from '@tundralibs/rapid';
import { client } from '@tundralibs/rapid/testing';

const app = await Application.initialize({ name: 'test', mode: 'DEVELOPMENT' });
app.get('/ping', () => ({ content: { ok: true } }));

const api = client(app);
const res = await api.get('/ping');
console.log(res.status, res.body);
```

`harness()` stocks each `stub` into a **fresh child container** per call — never
the process-wide `Doctor` — so tests isolate by construction and cannot leak into
one another; pass `container` to boot against an app's own `app.container`
instead. `dispose()` (or `await using`) tears the runtime down.

```ts
import { RapidModule } from '@tundralibs/rapid/modules';
import { harness } from '@tundralibs/rapid/testing';
import { inject, label } from '@tundralibs/doctor';

const Clock = label<{ now(): string }>('Clock');

class Stamper extends RapidModule {
  readonly name = 'Stamper';
  readonly namespace = 'stamp';
  protected readonly events = {};
  private readonly clock = inject(Clock);
  stamp(): { at: string } {
    return { at: this.clock.now() };
  }
}

const h = await harness({
  modules: [{ Stamper }],
  stub: [[Clock, { now: () => 'FROZEN' }]], // stocked into a fresh child
});
console.log(h.modules.Stamper.stamp()); // { at: 'FROZEN' }
await h.dispose();
```

## Runtime support

Every target **loads** the package cleanly. What runs depends on the target's
capabilities:

- **Deno / Bun / Node.js** — full support: `app.start()` opens a listening
  server (TCP or Unix socket), cron jobs are scheduled, WebSocket commands and
  file uploads work.
- **Cloudflare Workers / browser** — no listening socket, filesystem, or
  scheduler. Serve requests through the fetch handler instead of `start()`:

  ```ts ignore
  export default { fetch: (request: Request) => app.fetch(request) };
  ```

  `fetch()` serves HTTP only — socket commands need a listener (and error if
  registered), jobs are not scheduled (fire them from a cron trigger with
  `app.triggerJob(name)`), and file uploads degrade gracefully: they are rejected
  with a typed `RAPID_UPLOADS_UNAVAILABLE` (501) rather than crashing.

## CLI

`rapid init` scaffolds a project. The **runtime is asked first** — it's a
project-wide choice, not a container detail: it decides the primary config
file (one, never both), the dev/start/test commands, and the deploy artifact.

```bash
deno run -A jsr:@tundralibs/rapid/cli init my-api --runtime bun --docker --github
```

| `--runtime` | config         | deploy artifact                              |
| ----------- | -------------- | -------------------------------------------- |
| `deno`      | `deno.json`    | `Dockerfile` on `tundrasoft/deno` (opt-in)   |
| `bun`       | `package.json` | `Dockerfile` on `tundrasoft/bun` (opt-in)    |
| `node`      | `package.json` | `Dockerfile` on `tundrasoft/node` (opt-in)   |
| `workers`   | `package.json` | `wrangler.toml` + `worker.ts` (no container) |

`--docker` writes a Dockerfile for the org `tundrasoft/<runtime>` images —
Alpine + s6-overlay, running as the unprivileged `tundra` user. Those images
start the app from an **ENV contract** (`TASK=start` on Deno, with `ALLOW_*`
mapped to `--allow-*` flags; `SCRIPT=start` on Bun/Node), so the generated
Dockerfile deliberately has no `CMD`/`ENTRYPOINT`. `--github` (opt-in) adds a
`.github/workflows/ci.yml` that runs fmt/lint/check/test on the chosen runtime.
`--module` / `--norm` add the module system and a `norm` model; `--yes`
accepts every default non-interactively. A `.gitignore` is written; `git init`
is left to you.

`--ai` (on by default) writes AI-assistant instructions so an agent building
the project starts with rapid's conventions pre-loaded: **one** real guide,
`AGENTS.md`, plus two thin pointers to it — `CLAUDE.md` (Claude Code) and
`.github/copilot-instructions.md` (Copilot) — so every tool resolves to a
single source that can't drift. The guide is rendered for _this_ project: its
runtime's commands, its module layout if you chose `--module`, rapid's actual
API (the `:id:` route grammar, the `{ content }` reply, `validated()`,
`harness()`/`client()`), the org coding conventions fitted to an app, and the
verified shape of each `@tundralibs/*` package an agent may reach for
(guardian, norm, oql, pact, cacher, id, crypt, restler, utils, slogger, …).

The other commands: `upgrade` bumps every `@tundralibs/*` dependency to its
latest release, `modules [dir]` (re)generates the modules barrel (`--check`
fails CI when it's stale), and `health [url]` hits a running app's health path
(exit 0 on 2xx).

## Examples & docs

A full module-based blog API (posts + nested comments over `@tundralibs/norm`,
DI via `@tundralibs/doctor`, versioning, a cron digest job, a WebSocket module,
and the endpoint + auth catalog) lives in
[`examples/`](./examples/) — run it with
`deno run -A packages/rapid/examples/main.ts`.

Every public symbol carries JSDoc; the subpath exports are `.` (root),
`./cli`, `./context`, `./decorators`, `./endpoints`, `./errors`,
`./middlewares`, `./modules`, `./testing`, and `./types`.

## License

MIT
