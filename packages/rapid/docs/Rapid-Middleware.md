# Middleware

Every middleware rapid ships, with every option, its default, its unit, what
is validated at build, and the pitfalls each one has. The rules shared by all
of them come first; read those once.

---

## TL;DR

- One shape: `import { cors } from '@tundralibs/rapid/middlewares'` (or the
  root), call the factory with an options object, register with `app.use()`
  or per route. Options are validated when the factory is called — a bad
  value is `RAPID_CONFIG` at boot, never on the first request.
- **Durations are seconds** everywhere (`timeout(5)`, `session({ idleTtl:
  1800 })`, `rateLimit({ window: 60 })`). Fractions are allowed where a
  sub-second value makes sense (`timeout(0.5)`).
- **Every non-standard header name is an option.** A client integrating with
  a different name never needs a fork.
- **Stateful middleware take `hooks`**, pact-style: a few purpose-named
  functions (`getSession`, `increment`, `claim`…) you implement over redis,
  cacher or anything else. Each ships an in-memory default so zero-config
  works on one replica.
- **Order is meaning.** `app.use(a, b, c)` is an onion: `a` wraps `b` wraps
  `c`. The catalog states each middleware's place; the summary table below
  is the order to register them in.
- The correlation id, the response-time header and the access log are **not
  middleware** — the core does them (`headers`, `logger.access` config).
- With `server.metrics` on, every decision the shipped middleware take is a
  series: `rapid_middleware_events_total{middleware,event,action}` — the
  `middleware` family in the
  [configuration reference](./Rapid-Configuration.md#servermetrics--metric-families).

---

## Registration and order

```ts
import { Application } from '@tundralibs/rapid';
import {
  compress,
  cors,
  csrf,
  etag,
  idempotency,
  rateLimit,
  secureHeaders,
  session,
  timeout,
} from '@tundralibs/rapid/middlewares';
import { pactAuth } from '@tundralibs/rapid/middlewares/pact';
import type { Pact } from '@tundralibs/pact';

declare const pact: Pact<{ READ: 1n }, 'Admin'>;
const { authenticate, authorize } = pactAuth(pact);

const app = await Application.initialize({
  name: 'api',
  secret: 'at-least-thirty-two-characters-long!',
});

app.use(
  secureHeaders(), // stamp first — survives every error override
  cors({ origin: ['https://app.example'] }),
  timeout(10), // outermost deadline for everything below
  rateLimit({ max: 100, window: 60 }),
  compress(), // outside etag: the tag hashes the identity body
  etag(),
  csrf(), // outside session: re-binds its token on the rotating response
  session(),
  authenticate, // fills ctx.auth for everything below
  idempotency({
    scope: (ctx) =>
      (ctx.auth as { principal: { id: string } } | undefined)?.principal.id,
  }),
);
app.get(
  '/admin',
  authorize('Admin', 'READ'),
  () => ({ content: { ok: true } }),
);
```

| Position       | Middleware              | Why there                                                                                   |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| outermost      | `secureHeaders`, `cors` | stamp headers before `next()`, so a 429/500 from anything inside still carries them         |
| outer          | `timeout`               | its budget covers everything registered after it                                            |
| outer          | `rateLimit`             | reject before any work is done                                                              |
| before etag    | `compress`              | `etag` must hash the identity body; `compress` then weakens the tag                         |
| before session | `csrf`                  | reads the session cookie the inner `session()` issued on THIS response to re-bind its token |
| after csrf     | `session`               | loads lazily; must be inside `csrf`                                                         |
| after session  | `authenticate` (pact)   | may read the session cookie; sets `ctx.auth` for guards and `idempotency`'s `scope`         |
| after auth     | `idempotency`           | needs the caller's identity for its key; must be outside the handler it protects            |
| per route      | `authorize(...)`        | route-level guards; liveness is the `health()` endpoint, an ordinary route                  |

Scope helpers narrow any middleware to one transport or surface:
`onlyHTTP(m)` / `onlySOCKET(m)` / `onlyJOB(m)` run it there and pass through
elsewhere; `guardHTTP(m)` / `guardSOCKET(m)` / `guardJOB(m)` run it there and
**block** other transports (fail-closed — use these for auth); `onlyApi(m)` /
`onlyUi(m)` run it on one HTTP surface (and, deliberately, on every off-HTTP
invocation: `onlyApi(authenticate)` must never unguard a socket frame).

---

## How middleware runs

**The shape.** A middleware is `(ctx, next) => void | Promise<void>`. It
receives the full transport context (`HTTPContext`, `SOCKETContext` or
`JOBContext`) and a `next()` that runs the rest of the chain. Call `next()`
at most once and **return or await it** — a second call is a 500
(`next() called multiple times`), and an abandoned `void next()` is logged,
because a handler rejection landing after the middleware returned would
otherwise be an unhandled rejection instead of a disclosed response.

**Where it runs.** `app.use()` middleware is the universal onion: it runs on
every HTTP request, every socket frame and every job firing, in
registration order. Route- and command-scoped middleware go inline before
the handler (`app.get('/x', a, b, handler)`) and run after the universal
chain, in that order. Both chains are composed once at registration, not
per request. Inside a `RapidModule`, `@Use` guards module-to-module
`invoke()` only and never runs for a transport request. A job whose
middleware never called `next()` is a distinct, logged outcome
(`handlerRan: false`), not a silent success.

**What a middleware may do.**

- **Short-circuit**: set `ctx.response = { status: 429, content: {...} }`
  and return without `next()`. The transports treat the response like a
  handler's.
- **Enrich before `next()`**: headers (`ctx.setHeader`), cookies,
  `ctx.state`, `ctx.setAuth()`. A header set before `next()` survives an
  error inside the chain — the error override replaces the body, not the
  accumulated headers. That is why `secureHeaders` and `cors` stamp first.
- **Post-process after `await next()`**: read `ctx.response`, `ctx.status`
  and `ctx.responseHeaders` (a copy — use `setHeader` to change anything)
  and replace the reply with `ctx.response = { content, headers }`. The
  setter keeps the interpreted `status` unless you give one, merges
  `headers` per key and appends `set-cookie`, so a body transform never
  resets a 404 to 200 or wipes another middleware's headers.
- **Throw** a `RapidError` (or let one propagate). It reaches disclosure
  like a handler's: logged, `app.onError` consulted, the mode-aware
  envelope sent.

**Transport awareness.** Branch on `ctx.type`, or wrap the middleware:

| Wrapper                                           | On its transport          | Elsewhere                                                                                          |
| ------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `onlyHTTP(m)` / `onlySOCKET(m)` / `onlyJOB(m)`    | runs                      | skipped — `next()` is called for it                                                                |
| `guardHTTP(m)` / `guardSOCKET(m)` / `guardJOB(m)` | runs                      | **rejected** with 403 `RAPID_ACCESS_DENIED` (fail-closed — auth)                                   |
| `onlyApi(m)` / `onlyUi(m)`                        | runs on that HTTP surface | skipped on the other surface; **runs** off-HTTP so a surface gate can never unguard a socket frame |

`middlewareScope(m)` reads the transport metadata a wrapper stamps
(`MIDDLEWARE_SCOPE`); it is informational — tooling can tell a
transport-bound middleware from a universal one, the framework attaches no
behaviour to it.

**Per-invocation state.** `ctx.state` is built from `app.state` per
`stateMode`. Under `SHARE` every invocation gets the same object, so a
middleware that writes per-invocation values into it must declare that with
`markStateKeyUser(mw)`; the boot then refuses `stateMode: 'SHARE'` for that
app instead of letting concurrent requests read each other's values.

**Writing a factory.** Follow the catalog's conventions so yours composes
with the rest:

```ts
import { RapidError } from '@tundralibs/rapid';
import type { RapidMiddleware } from '@tundralibs/rapid';

type StampOptions = {
  /** Header name to stamp. @default 'x-served-by' */
  header?: string;
  /** Cache lifetime in SECONDS. @default 0 */
  maxAge?: number;
};

export function stamp(options: StampOptions = {}): RapidMiddleware {
  const header = options.header ?? 'x-served-by';
  const maxAge = options.maxAge ?? 0;
  // Validate at build: a bad option is RAPID_CONFIG at boot, never a
  // TypeError on the first request.
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'stamp maxAge must be a non-negative integer number of seconds',
      details: { maxAge },
    });
  }
  return async (ctx, next) => {
    if (ctx.type !== 'HTTP') return await next();
    ctx.setHeader(header, 'rapid'); // before next(): survives an error
    await next();
    if (maxAge > 0 && ctx.status === 200) {
      ctx.setHeader('cache-control', `public, max-age=${maxAge}`);
    }
  };
}
```

Validate every option when the factory is called, keep durations in
seconds, make non-standard header names options, and take persistence as a
small `hooks` object with an in-memory default rather than a generic store.

---

## secureHeaders

Response hardening — helmet's default set. HTTP only. Headers are computed
once at build and stamped **before** `next()`, so error responses carry them
too. Document-only policies (COOP, COEP, Origin-Agent-Cluster) are stamped on
the `ui` surface only; everything else on every HTTP response.

| Option                         | Type / values                                                             | Default           | Header                                   |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------- | ---------------------------------------- |
| `contentTypeOptions`           | `boolean`                                                                 | `true`            | `X-Content-Type-Options: nosniff`        |
| `frameOptions`                 | `'DENY' \| 'SAMEORIGIN' \| false`                                         | `'DENY'`          | `X-Frame-Options`                        |
| `referrerPolicy`               | one Referrer Policy token, or a comma-separated fallback list, or `false` | `'no-referrer'`   | `Referrer-Policy`                        |
| `hsts`                         | `false \| true \| { maxAge?, includeSubDomains?, preload? }`              | `false`           | `Strict-Transport-Security`              |
| `hsts.maxAge`                  | non-negative integer **seconds** (`0` tells browsers to forget)           | `15552000` (180d) |                                          |
| `hsts.includeSubDomains`       | `boolean`                                                                 | `true`            |                                          |
| `hsts.preload`                 | `boolean` — requires `maxAge ≥ 31536000` and `includeSubDomains`          | `false`           |                                          |
| `contentSecurityPolicy`        | single-line policy string, or `false`                                     | `false`           | `Content-Security-Policy`                |
| `crossOriginOpenerPolicy`      | `'same-origin' \| 'same-origin-allow-popups' \| 'unsafe-none' \| false`   | `'same-origin'`   | `Cross-Origin-Opener-Policy` (ui only)   |
| `crossOriginResourcePolicy`    | `'same-origin' \| 'same-site' \| 'cross-origin' \| false`                 | `'same-origin'`   | `Cross-Origin-Resource-Policy`           |
| `crossOriginEmbedderPolicy`    | `'require-corp' \| 'credentialless' \| false`                             | `false`           | `Cross-Origin-Embedder-Policy` (ui only) |
| `originAgentCluster`           | `boolean`                                                                 | `true`            | `Origin-Agent-Cluster: ?1` (ui only)     |
| `permittedCrossDomainPolicies` | `'none' \| 'master-only' \| 'by-content-type' \| 'all' \| false`          | `'none'`          | `X-Permitted-Cross-Domain-Policies`      |
| `dnsPrefetchControl`           | `'off' \| 'on' \| false`                                                  | `'off'`           | `X-DNS-Prefetch-Control`                 |
| `xssProtection`                | `boolean` (emits `0` — disables the legacy auditor)                       | `true`            | `X-XSS-Protection`                       |
| `permissionsPolicy`            | `{ feature: ['self' \| '*' \| origin, ...] }`, a raw string, or `false`   | `false`           | `Permissions-Policy`                     |

**Validated at build:** every enum value, Referrer Policy tokens, `hsts.maxAge`,
the preload prerequisites, single-line CSP/Permissions-Policy strings,
Permissions-Policy feature names and allowlist entries.

**Pitfalls.** HSTS is opt-in because a service that also answers plain HTTP
locks browsers out for `maxAge` seconds; turn it on only behind TLS
everywhere. `crossOriginOpenerPolicy: 'same-origin'` severs `window.opener`
and breaks sign-in **popup** flows — use `'same-origin-allow-popups'` there.
`crossOriginResourcePolicy: 'same-origin'` blocks no-cors embedding
(`<img>`, fonts) of your responses from other sites — assets served for other
origins need `'same-site'` or `'cross-origin'`. `Permissions-Policy` has no
sensible universal default, so it is off until you write one.

## cors

Cross-Origin Resource Sharing. HTTP only. Headers are stamped before `next()`
so errors are readable by the browser; preflights (`OPTIONS` +
`Access-Control-Request-Method`) are answered `204` and never reach the router.
A disallowed origin is **not** an error: the response simply carries no CORS
headers and the browser blocks it.

| Option           | Type / values                                                                             | Default                               |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| `origin`         | `'*'`, one serialized origin, a list of them, or `(origin) => boolean`                    | `'*'`                                 |
| `methods`        | non-empty list of HTTP tokens                                                             | `GET, HEAD, PUT, PATCH, POST, DELETE` |
| `allowedHeaders` | list of HTTP tokens; absent → the request's `Access-Control-Request-Headers` is reflected | reflected                             |
| `exposedHeaders` | list of HTTP tokens                                                                       | none                                  |
| `credentials`    | `boolean`                                                                                 | `false`                               |
| `maxAge`         | non-negative integer **seconds** (`Access-Control-Max-Age`)                               | unset                                 |

**Validated at build:** origin strings must be _serialized origins_
(`https://app.example`, `http://localhost:3000` — no path, lowercase; browsers
send lowercase, so `HTTPS://App.example` would never match), a non-empty
origin list, non-empty `methods`, tokens everywhere, `maxAge`.

**Pitfalls.** `origin: '*'` with `credentials: true` is _reflect-any-origin
with credentials_ — the spec forbids the literal `*`, so the caller's origin
is echoed instead, which is the classic misconfiguration; pair `credentials`
with a list or predicate. Reflected `allowedHeaders` makes the preflight vary
by request, so `Vary: Access-Control-Request-Headers` is added — a fixed list
does not. Browsers cap `maxAge` themselves (Chromium 7200 s, Firefox 86400 s).
`Vary: Origin` is stamped for every origin-bearing request, allowed or not, so
a shared cache never serves one origin's response to another.

## compress

gzip/deflate via the Web-standard `CompressionStream` (no brotli: it is not
available on every runtime). HTTP only; runs after `next()`.

| Option      | Type                           | Default |
| ----------- | ------------------------------ | ------- |
| `threshold` | non-negative integer **bytes** | `1024`  |

Behaviour: compresses a compressible content type (`text/*`, JSON, XML,
JavaScript, SVG, WASM, manifests) when the client accepts gzip or deflate
(RFC 9110 `Accept-Encoding` semantics, `*` and `q=0` honoured) and the buffered
body is at least `threshold` bytes; streamed bodies are compressed chunk-wise
regardless of size. Sets `Content-Encoding`, drops a stale `Content-Length`,
merges `Accept-Encoding` into `Vary` on **every** compressible response
(encoded or not, so caches key correctly), and weakens an inner `etag()`'s
strong tag (`W/`), because the encoded representation is a different one. A
HEAD carries the same headers its GET would. Skips: `204`/`205`/`304`,
`206`/`Content-Range` (byte offsets are identity offsets), already-encoded
bodies.

**Pitfall.** Register `compress()` **outside** `etag()`
(`app.use(compress(), etag())`). The other way round, the tag would hash
compressed bytes and change with the negotiated encoding.

## etag

Strong content-hash `ETag` and `304 Not Modified` for `GET`/`HEAD` `200`
responses. No options. Weak comparison for `If-None-Match` (`W/`, `*`, lists).
Streamed bodies are not hashed (static file streams carry their own cheap
stat-based weak tag). Register **inside** `compress()`.

## csrf

Stateless CSRF protection: a **signed, session-bound double-submit** token in
a JS-readable cookie that the client echoes in a header (or a form field) on
state-changing methods. No store. HTTP only. Signed with the app `secret`.

| Option     | Type                          | Default          | Meaning                                                           |
| ---------- | ----------------------------- | ---------------- | ----------------------------------------------------------------- |
| `cookie`   | cookie-name token             | `'csrf'`         | the token cookie (not HttpOnly — the app's JS must read it)       |
| `header`   | header-name token             | `'x-csrf-token'` | where the client echoes the token                                 |
| `field`    | non-empty string              | `'_csrf'`        | form field checked when the header is absent                      |
| `session`  | cookie-name token             | `'sid'`          | the session cookie the token is bound to (`session()`'s `cookie`) |
| `sameSite` | `'Strict' \| 'Lax' \| 'None'` | `'Lax'`          | `'None'` requires `secure`                                        |
| `secure`   | `boolean`                     | `true`           |                                                                   |
| `path`     | absolute path                 | `'/'`            |                                                                   |

**Validated at build:** names are tokens; `path` is absolute;
`sameSite: 'None'` with `secure: false` is refused (browsers drop such a
cookie); a `__Host-` name needs `secure` + `path: '/'`, a `__Secure-` name
needs `secure`.

**How it works.** The token is `<nonce>.<binding>.<signature>` where the
binding is a keyed hash of the session cookie's value (`''` when anonymous).
A token minted under one session — or by an attacker from a writable
subdomain — never verifies for another. When the session changes (login,
`regenerate()`, logout) the token is re-issued **on the same response**,
provided `csrf()` is registered **outside** `session()`. The token valid for
the current response is published to the view bag as `view.csrfToken`, so a
first-visit form is never empty.

**Pitfalls.** Registered inside `session()`, the re-issue lands one response
late: the first state-changing request after a login is rejected once. The
default `secure: true` means the cookie is dropped over plain HTTP — every
request then 403s; set `secure: false` only for local development. On an api
surface that authenticates with a token (no cookie), CSRF is unnecessary —
scope it with `onlyUi(csrf())`; on a surface that accepts a cookie
credential, keep it unscoped. Header-based clients never trigger a body
parse; the form-field fallback reads `ctx.payload`, which shares its bytes
with `ctx.rawPayload`, so `idempotency()` and `pactAuth` may sit on either
side of it.

## session

Cookie-keyed, hook-backed per-client state, loaded **lazily** — a request that
never calls `getSession(ctx)` costs no store round-trip and no HMAC. HTTP only.
Two expiries: a rolling idle TTL that slides on requests that _touch_ the
session, and a hard absolute cap.

| Option        | Type                          | Default                | Meaning                                                           |
| ------------- | ----------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `hooks`       | `SessionHooks`                | `memorySessionHooks()` | persistence — see below                                           |
| `cookie`      | cookie-name token             | `'sid'`                | the signed id cookie                                              |
| `idleTtl`     | positive integer **seconds**  | `1800` (30 min)        | idle expiry; also the cookie's `Max-Age`; must be ≤ `absoluteTtl` |
| `absoluteTtl` | positive integer **seconds**  | `43200` (12 h)         | hard lifetime cap                                                 |
| `rolling`     | `boolean`                     | `true`                 | slide the idle window on every touch, not only on writes          |
| `sameSite`    | `'Strict' \| 'Lax' \| 'None'` | `'Lax'`                | `'None'` requires `secure`                                        |
| `secure`      | `boolean`                     | `true`                 |                                                                   |
| `path`        | absolute path                 | `'/'`                  |                                                                   |

`SessionHooks` — each may return a value or a promise; `ttl` is seconds:

```ts
import type {
  SessionHooks,
  SessionRecord,
} from '@tundralibs/rapid/middlewares';

declare const redis: {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, mode: 'EX', ttl: number): Promise<unknown>;
  del(k: string): Promise<unknown>;
  expire(k: string, ttl: number): Promise<unknown>;
};

const hooks: SessionHooks = {
  async getSession(id) {
    const raw = await redis.get(`sess:${id}`);
    return raw === null ? undefined : JSON.parse(raw) as SessionRecord;
  },
  async saveSession(id, record, ttl) {
    await redis.set(`sess:${id}`, JSON.stringify(record), 'EX', ttl);
  },
  async deleteSession(id) {
    await redis.del(`sess:${id}`);
  },
  async touchSession(id, ttl) { // optional — slides the window without rewriting
    await redis.expire(`sess:${id}`, ttl);
  },
};
```

In a handler: `const s = (await getSession(ctx))!; s.get('cart'); s.set(...);
s.regenerate()` on login (new id, same data — defeats fixation);
`s.destroy()` on logout. The save phase runs after the handler even when it
threw, so logout-then-throw still logs out.

**Pitfalls.** `memorySessionHooks` is per-process: behind two replicas a user
flips between sessions — inject shared hooks the moment you scale out. A
read-only request slides the window through `touchSession` (or a re-save of
the _current_ stored record when the hook is absent), never by writing back
its own snapshot, so a page render overlapping a POST cannot erase the write.
Values must be `structuredClone`-able: a function or a class instance in the
session fails _that_ request loudly rather than poisoning the record. Under
`stateMode: 'SHARE'` nothing changes — the session rides the request context,
not `ctx.state`.

## rateLimit

Fixed-window limiting keyed per client address (HTTP), per connection
(sockets); jobs are exempt. Counting is one hook, atomic by contract.

| Option    | Type                                                                           | Default                                                               |
| --------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `max`     | positive integer hits per window                                               | `60`                                                                  |
| `window`  | positive integer **seconds**                                                   | `60`                                                                  |
| `key`     | `(ctx) => string \| null` — `null` exempts the invocation                      | address / connection id / `null` on jobs                              |
| `hooks`   | `{ increment(key, window) }`                                                   | `memoryRateLimitHooks()`                                              |
| `headers` | `true`, `false`, or `{ limit?, remaining?, reset?, retryAfter? }` header names | `true` — `x-ratelimit-limit` / `-remaining` / `-reset`, `retry-after` |

`increment(key, window)` must atomically bump the key's counter for the
current window and return `{ count, resetAt }` (epoch ms), starting a window
that resets `window` seconds from now when none is live — a redis `INCR` +
`EXPIRE NX`. The in-memory default is atomic by being synchronous. Rename the
headers to the IETF draft's `RateLimit-Limit` / `RateLimit-Remaining` /
`RateLimit-Reset` through `headers`. On rejection: `429 RAPID_RATE_LIMITED`
with `retry-after` in seconds.

**Pitfalls.** Behind a proxy the default key is the proxy's address until
`server.trustProxy` is set to the hop count — every client then shares one
budget. A fixed window allows up to `2 × max` hits across a window boundary;
use a smaller `window` if that matters.

## idempotency

Safe client retries: a request carrying `Idempotency-Key` executes once, a
retry replays the first reply, a concurrent duplicate is a 409, and a key
reused for a _different_ request is a 422 (IETF `Idempotency-Key` draft
semantics — every attempt is fingerprinted over method, path and raw body).
HTTP only; unmatched requests pass through.

| Option           | Type                                                             | Default                                  |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `scope`          | **required** — `(ctx) => identity \| undefined`, or `false`      | —                                        |
| `ttl`            | positive integer **seconds** a completed reply replays           | `86400` (24 h)                           |
| `pendingTtl`     | positive integer **seconds** a crashed attempt may block its key | `60`                                     |
| `header`         | header-name token                                                | `'idempotency-key'`                      |
| `replayedHeader` | header-name token (set to `true` on a replay)                    | `'idempotency-replayed'`                 |
| `maxRecords`     | positive integer — bound on the memory default                   | `10000`                                  |
| `hooks`          | `IdempotencyHooks`                                               | `memoryIdempotencyHooks({ maxRecords })` |

`scope` is required because a key without an identity replays one caller's
response to anyone who guesses the header: return the session id, auth
subject or API-key id; `undefined`/`''` skips idempotency for that request;
`false` is the explicit opt-in to a shared key space (a webhook receiver keyed
by the provider's event id). The record key is surface + route pattern +
scope + client key.

`IdempotencyHooks` — `ttl` in seconds:

- `getRecord(key)` → record or `undefined`
- `claim(key, pendingRecord, ttl)` → `boolean` — store **only if absent**
  (redis `SET NX EX`); `true` means this call owns the key. This atomicity is
  what makes a concurrent duplicate a 409 across replicas.
- `saveRecord(key, record, ttl)` — the completed reply
- `release(key)` — drop it so a retry re-executes

What replays: `content`, `status`, and the headers the inner chain added
(per-request stamps like the request id are re-issued fresh). Not replayed,
and never recorded: thrown errors, streamed or unserialisable bodies,
`set-cookie` (a login must not sit behind an idempotency key).

**Pitfalls.** The fingerprint reads the raw body (`ctx.rawPayload`) — register
`idempotency()` before anything else that parses the body, or they share the
same cached bytes (fine) but a middleware that _replaces_ the body first would
change the fingerprint. Multipart bodies embed a random boundary per request,
so a multipart retry from a browser will mismatch (422) — keep idempotent
endpoints JSON. With `timeout()` in the chain, a deadline that fires leaves
the key **pending** until `pendingTtl` (the work may still be running); size
`pendingTtl` above the handler's worst case. Errors: `RAPID_IDEMPOTENCY_KEY_INVALID`
(400), `RAPID_IDEMPOTENCY_IN_FLIGHT` (409), `RAPID_IDEMPOTENCY_MISMATCH` (422).

## timeout

`timeout(seconds)` — a deadline on everything registered after it, on every
transport. `seconds` is a positive number, fractions allowed (`timeout(0.5)`),
at least one millisecond. On expiry the response is overridden with `504
RAPID_TIMEOUT` (`details: { seconds, action }`).

**Pitfalls.** JavaScript cannot cancel a promise: the handler **keeps running**
after the 504, its result discarded. On jobs the abandoned work is handed to
`ctx.detach()` so the scheduler's overlap guard stays held — otherwise every
tick would start another copy of a wedged handler. Combined with
`idempotency()` the key stays pending until `pendingTtl`. A handler that
finishes in a photo-finish with the deadline may still win — best-effort, not
a fence.

## pact (`@tundralibs/rapid/middlewares/pact`)

`pactAuth(pact, options) → { authenticate, authorize, login, logout, refresh,
me }` — rapid's adapter over pact's neutral middleware core plus the session
handlers over the instance. Options are pact's `PactMiddlewareOptions`
(carriers per scheme, `hmac`, `encryption`, `challenge`, `realm`) plus
`bearer.cookie`, `optional` defaulting to `true`, and `session` (`fields`,
`cookie` attributes, `refreshCookie`, `principal` projection). `authorize()`
carries OpenAPI metadata, so a guarded route documents its requirement and
the configured schemes; `markOpenApi()` gives your own guard the same
ability. Fully described in
[Authentication & authorization](./Rapid-Auth.md).

## Writing your own

A middleware is `(ctx, next) => Promise<unknown>`; narrow by `ctx.type`
(`'HTTP' | 'SOCKET' | 'JOB'`) and, on HTTP, by `ctx.surface`. Set headers
before `next()` when they must survive an error; read the reply after
`next()` via `ctx.response`, `ctx.status` and `ctx.responseHeaders`; replace it
with `ctx.response = { content, headers }` (the interpreted status is kept).
Throw a `RapidError` to fail. If you write per-invocation values into
`ctx.state`, wrap the middleware with `markStateKeyUser(mw)` so
`stateMode: 'SHARE'` refuses it at boot instead of corrupting state under
concurrency. If a body-bound feature needs the raw bytes, read
`ctx.rawPayload` before anything parses `ctx.payload`.

---

[← Back to rAPId](../README.md)
