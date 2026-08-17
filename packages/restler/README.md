# Restler

A small, cross-runtime base class for building typed REST/HTTP API clients.
You extend `RESTler` once per API vendor, and it handles URL building,
authentication, content-type (de)serialization, timeouts, events, and
errors — over a runtime-aware `fetch` that also supports Unix sockets and
TLS client authentication.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Defining a Client](#defining-a-client)
- [Requests & Responses](#requests--responses)
- [Content Types](#content-types)
- [Authentication](#authentication)
- [Unix Sockets](#unix-sockets)
- [TLS Client Authentication](#tls-client-authentication)
- [Events](#events)
- [Observability](#observability)
- [Vendor Response Handling](#vendor-response-handling)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
- [License](#license)

## Overview

`@tundralibs/restler` is **not** a fetch wrapper you instantiate directly.
It is an `abstract` class you subclass to model a specific API. Your subclass
sets a `vendor` identifier and exposes domain methods (e.g. `getUser`,
`listContainers`) that call the protected `_makeRequest` helper. RESTler then:

- builds the full URL from `baseURL` + `path` (+ optional `port`, `version`,
  `query`);
- injects authentication headers;
- serializes the request body by content type and parses the response body;
- enforces a per-request timeout;
- emits lifecycle events (`call`, `authFailure`, `rateLimit`, …);
- maps failures onto typed errors.

Requests run over [`@tundralibs/compat`](../compat/README.md)'s runtime-aware
`fetch`, so the same client works on Deno, Bun, and Node — including its Unix
socket and TLS client-auth extensions where the runtime supports them.

## Features

| Feature                                     | Deno | Bun | Node.js |
| ------------------------------------------- | ---- | --- | ------- |
| HTTP / HTTPS requests                       | ✅   | ✅  | ✅      |
| JSON / XML / FORM / TEXT / BLOB bodies      | ✅   | ✅  | ✅      |
| BASIC / BEARER / custom authentication      | ✅   | ✅  | ✅      |
| Per-request timeout                         | ✅   | ✅  | ✅      |
| Lifecycle events & rate-limit parsing       | ✅   | ✅  | ✅      |
| Unix domain socket transport (`socketPath`) | ✅   | ✅  | ❌\*    |
| TLS client authentication (`tls`)           | ✅   | ✅  | ❌\*    |

\* Unix sockets and TLS client auth are provided by compat's `fetch` and are
only available on Deno and Bun; using them on Node throws
`UnsupportedRuntimeError`. Plain HTTP/HTTPS works everywhere.

## Installation

**Deno:**

```bash
deno add @tundralibs/restler
```

**Bun:**

```bash
bunx jsr add @tundralibs/restler
```

**Node.js:**

```bash
npx jsr add @tundralibs/restler
```

**Direct import (Deno):**

```typescript
import { RESTler } from 'jsr:@tundralibs/restler';
```

## Quick Start

```typescript
import { RESTler } from '@tundralibs/restler';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

class TodoAPI extends RESTler {
  public readonly vendor = 'jsonplaceholder';

  constructor() {
    super({ baseURL: 'https://jsonplaceholder.typicode.com' });
  }

  getTodo(id: number) {
    return this._makeRequest<Todo>({ path: `/todos/${id}`, method: 'GET' });
  }

  createTodo(todo: Omit<Todo, 'id'>) {
    return this._makeRequest<Todo>({
      path: '/todos',
      method: 'POST',
      contentType: 'JSON',
      payload: todo,
    });
  }
}

const api = new TodoAPI();
const res = await api.getTodo(1);
console.log(res.status, res.body?.title);
```

## Configuration

`RESTlerOptions` is passed to `super(...)` in your subclass constructor. Only
`baseURL` is required.

| Option           | Type                     | Default  | Notes                                                                                             |
| ---------------- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `baseURL`        | `string`                 | —        | Required. May contain a `{version}` placeholder.                                                  |
| `port`           | `number`                 | —        | 1–65535.                                                                                          |
| `headers`        | `Record<string, string>` | `{}`     | Default headers sent with every request.                                                          |
| `timeout`        | `number`                 | `30`     | Seconds. Must be `>= 1` and `<= 120`.                                                             |
| `contentType`    | `RESTlerContentType`     | `'JSON'` | Default body content type (`JSON \| XML \| FORM \| TEXT \| BLOB`).                                |
| `version`        | `string`                 | —        | Replaces `{version}` in URLs, query values, and headers.                                          |
| `socketPath`     | `string`                 | —        | Route over a Unix socket (Deno/Bun). Must point to an existing path.                              |
| `tls`            | `TLSOptions`             | —        | TLS client auth (Deno/Bun). See [TLS](#tls-client-authentication).                                |
| `auth`           | `RESTlerAuth`            | —        | Default authentication. See [Authentication](#authentication).                                    |
| `witness`        | `Witness`                | —        | Observability wrap hook (suite convention). See [Observability](#observability).                  |
| `headerProvider` | `RESTlerHeaderProvider`  | —        | Per-request outbound headers (traceparent, correlation ids). See [Observability](#observability). |

Values are validated in the constructor; an invalid value — or a missing
required `baseURL` (including when it's absent from loosely-typed config loaded
from JSON/env) — throws [`RESTlerConfigError`](#errors).

## Defining a Client

Subclass `RESTler`, set the abstract `vendor` field, and add methods that call
the protected `_makeRequest<T>(endpoint)`. The generic `T` types the parsed
response body.

```typescript
import { RESTler } from '@tundralibs/restler';

class GitHubAPI extends RESTler {
  public readonly vendor = 'github';

  constructor(token: string) {
    super({
      baseURL: 'https://api.github.com',
      version: 'v3',
      headers: { Accept: 'application/vnd.github+json' },
      auth: { type: 'BEARER', token },
    });
  }

  getUser(login: string) {
    return this._makeRequest<{ id: number; login: string }>({
      path: `/users/${login}`,
      method: 'GET',
    });
  }
}
```

Every endpoint may override instance-level options (`baseURL`, `port`,
`version`, `timeout`, `contentType`, `auth`, `headers`) on a per-request
basis via the `RESTlerEndpoint` fields. Overrides are validated the same
way as their instance-level counterparts — e.g. a per-endpoint `timeout`
outside the `1…120` second range, or a `contentType` that isn't one of
`JSON`/`XML`/`FORM`/`TEXT`/`BLOB`, throws `RESTlerConfigError`.

## Requests & Responses

`_makeRequest` resolves to a `RESTlerResponse<T>`:

```typescript
import type { RESTlerResponse } from '@tundralibs/restler';

declare const api: {
  getUser(
    login: string,
  ): Promise<RESTlerResponse<{ id: number; login: string }>>;
};

const res = await api.getUser('octocat');

res.url; // Final requested URL
res.status; // HTTP status code (e.g. 200) or null if no response was received
res.statusText; // e.g. "OK"
res.headers; // Record<string, string> (lowercased keys)
res.body; // Parsed body, typed as T
res.timeTaken; // Milliseconds
res.error; // RESTlerError if the request failed
```

HTTP error statuses (4xx/5xx) are **returned normally** — inspect
`res.status`. Transport-level failures (timeout, connection error, a thrown
error) **reject**: wrap calls in `try/catch`. See
[Error Handling](#error-handling).

## Content Types

Set `contentType` (and `payload`) on a body-bearing endpoint. The body is
serialized and a default `Content-Type` header is set when you haven't
provided one.

| `contentType` | `payload` type                    | Serialized as / `Content-Type`                              |
| ------------- | --------------------------------- | ----------------------------------------------------------- |
| `JSON`        | `Record<string, unknown>`         | `JSON.stringify` / `application/json`                       |
| `XML`         | `Record<string, unknown>`         | XML string / `application/xml`                              |
| `FORM`        | `FormData`                        | `FormData` (the runtime sets the boundary)\*                |
| `FORM`        | `URLSearchParams` or plain object | urlencoded string / `application/x-www-form-urlencoded`\*\* |
| `TEXT`        | `string`                          | raw string / `text/plain`                                   |
| `BLOB`        | `Blob`                            | the `Blob` as-is                                            |

\* For a `FormData` payload, any inherited `Content-Type` header is removed
so `fetch` can set the correct `multipart/form-data` boundary.

\*\* `FORM`'s wire format is decided by the payload's SHAPE — a `URLSearchParams`
or plain object sends `application/x-www-form-urlencoded`, the format
essentially every OAuth2 token exchange (and Stripe's whole API) requires.
`URLSearchParams`'s own serializer (space → `+`) is used here, which is
correct for this media type — note this is DIFFERENT from `endpoint.query`
(the URL's query string), which is percent-encoded per RFC 3986
(space → `%20`) instead, since a `+` there breaks any signing-based auth
that re-derives a canonical query string (e.g. AWS SigV4).

The response body is parsed from its `Content-Type`: `*/json` → object,
`*/xml` → object, `*/*text*` → string; an unknown/empty type is best-effort
JSON, falling back to the raw string.

### Binary Responses

The default path above reads the response body as **text**, which corrupts
binary payloads — so for files, images, and other binary bodies you must set
`responseType` on the endpoint. `'BLOB'` reads the body as a `Blob`,
`'ARRAY_BUFFER'` as an `ArrayBuffer`; content-type parsing is skipped
entirely.

```typescript
import { RESTler } from '@tundralibs/restler';

class FileAPI extends RESTler {
  public readonly vendor = 'files';

  constructor() {
    super({ baseURL: 'https://files.example.com' });
  }

  download(id: string) {
    return this._makeRequest<Blob>({
      path: `/files/${id}`,
      method: 'GET',
      responseType: 'BLOB',
    });
  }
}

const res = await new FileAPI().download('report.pdf');
console.log(res.body?.size, res.body?.type); // Blob size and MIME type
```

## Authentication

`auth` is a discriminated union keyed by `type`. Set it instance-wide (in
`RESTlerOptions`) or per request (on the endpoint — the endpoint wins).

```typescript ignore
// Basic — sends `Authorization: Basic base64(user:pass)`. An EMPTY password
// is valid (RFC 7617) — e.g. Stripe's `sk_live_...:` pattern.
{ type: 'BASIC', username: 'user', password: 'secret' }
{ type: 'BASIC', username: 'sk_live_abc123', password: '' }

// Bearer — sends `Authorization: <prefix> <token>` (prefix defaults to "BEARER")
{ type: 'BEARER', token: 'abc123' }
{ type: 'BEARER', token: 'abc123', prefix: 'Bearer' }

// Custom — interpreted by your subclass (see below)
{ type: 'CUSTOM', apiKey: 'xyz' }
```

The base class injects the `Authorization` header for `BASIC` and `BEARER`.
For anything else (API key in the query string or a custom header), override
`_authInjector`. It may be `async` (e.g. to refresh a token before the call).

The `endpoint` handed to `_authInjector` is a per-request copy, so mutating it
(as the example below does) never writes back onto the caller's endpoint
object. A shared or reused endpoint object therefore never accumulates one
call's credentials — safe for an endpoint catalog shared across per-tenant
client instances.

```typescript
import { RESTler } from '@tundralibs/restler';
import type { RESTlerEndpoint } from '@tundralibs/restler';

class WeatherAPI extends RESTler {
  public readonly vendor = 'openweathermap';

  constructor(private apiKey: string) {
    super({ baseURL: 'https://api.openweathermap.org/data/2.5' });
  }

  // Add the API key to every request's query string.
  protected override _authInjector(endpoint: RESTlerEndpoint): void {
    endpoint.query = { ...endpoint.query, appid: this.apiKey };
  }

  getCurrentWeather(city: string) {
    return this._makeRequest({
      path: '/weather',
      method: 'GET',
      query: { q: city, units: 'metric' },
    });
  }
}
```

### Signing-based auth (HMAC, SigV4-style)

By the time `_authInjector` runs, `endpoint.headers` already holds the
**full** outbound header set — instance-level defaults, `headerProvider()`'s
output, and the caller's own explicit headers, already merged (the caller's
own entries win on a collision). A signature computed over `endpoint.headers`
therefore covers everything actually sent, not just whatever the caller
happened to pass to one particular call. The one exception: the default
`Content-Type` for JSON/XML/TEXT payloads is computed later, in `_buildBody`
— to sign it, set `Content-Type` explicitly on `endpoint.headers` yourself
before calling `_makeRequest`.

`_base64Utf8(value: string): string` is `protected`, not `private` — reuse
it for Basic-style header encoding in your own scheme instead of
reimplementing UTF-8-correct base64.

```typescript
import { RESTler } from '@tundralibs/restler';
import type { RESTlerEndpoint } from '@tundralibs/restler';

class SignedAPI extends RESTler {
  public readonly vendor = 'signed-vendor';

  constructor(private secret: string) {
    super({ baseURL: 'https://api.example.com' });
  }

  protected override _authInjector(endpoint: RESTlerEndpoint): void {
    // endpoint.headers is already the FULL set — sign it as-is.
    const signature = this.sign(endpoint.headers ?? {}, this.secret);
    endpoint.headers = { ...endpoint.headers, 'X-Signature': signature };
  }

  private sign(_headers: Record<string, string>, _secret: string): string {
    return 'computed-signature'; // real HMAC/SigV4 canonicalization goes here
  }
}
```

### OAuth2 token exchange (`skipAuth`)

A `CUSTOM` auth that fetches its own token needs to make a request as part
of `_authInjector` — but `_authInjector` runs unconditionally on every
`_makeRequest` call, so a token-fetch that itself called `_makeRequest`
would recurse into its own `_authInjector` before the token exists.
`skipAuth: true` on that ONE call breaks the recursion while keeping
everything else `_makeRequest` normally provides — timeout/abort, the
`call` event, error normalization, witness/tracing:

```typescript
import { RESTler } from '@tundralibs/restler';
import type { RESTlerEndpoint } from '@tundralibs/restler';

class OAuth2API extends RESTler {
  public readonly vendor = 'oauth2-vendor';
  private token: string | undefined;

  constructor(private clientId: string, private clientSecret: string) {
    super({ baseURL: 'https://api.example.com' });
  }

  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    if (this.token === undefined) {
      const res = await this._makeRequest<{ access_token: string }>(
        {
          path: '/oauth/token',
          method: 'POST',
          contentType: 'FORM',
          payload: {
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
          },
        },
        { skipAuth: true }, // <- breaks the recursion
      );
      this.token = res.body?.access_token;
    }
    endpoint.headers = {
      ...endpoint.headers,
      Authorization: `Bearer ${this.token}`,
    };
  }
}
```

## Unix Sockets

Set `socketPath` to route requests over a Unix domain socket instead of TCP —
ideal for the Docker Engine API, container runtimes, and local daemons. The
`baseURL` host is ignored for transport but still used to build the path.

> Available on Deno and Bun only (provided by compat's `fetch`). On Node this
> throws `UnsupportedRuntimeError`.

```typescript
import { RESTler } from '@tundralibs/restler';

class DockerAPI extends RESTler {
  public readonly vendor = 'docker';

  constructor(socketPath = '/var/run/docker.sock') {
    super({ baseURL: 'http://localhost', socketPath });
  }

  listContainers(all = false) {
    return this._makeRequest<unknown[]>({
      path: '/containers/json',
      method: 'GET',
      query: { all: all ? 'true' : 'false' },
    });
  }

  ping() {
    return this._makeRequest({ path: '/_ping', method: 'GET' })
      .then((r) => r.status === 200);
  }
}

const docker = new DockerAPI();
console.log(await docker.ping());
```

## TLS Client Authentication

Set `tls` for mutual TLS, a custom CA, or to skip verification. Supply **either**
inline PEM (`cert` / `key` / `ca`) **or** file paths (`certFile` / `keyFile` /
`caFile`) — the two styles are mutually exclusive — plus the optional
`rejectUnauthorized` flag.

> Available on Deno and Bun only. On Node this throws `UnsupportedRuntimeError`.
> Plain HTTPS against public CAs needs no `tls` option and works everywhere.

```typescript
import { RESTler } from '@tundralibs/restler';

class SecureAPI extends RESTler {
  public readonly vendor = 'secure';

  constructor() {
    super({
      baseURL: 'https://internal.example.com',
      tls: {
        certFile: './client.crt',
        keyFile: './client.key',
        caFile: './ca.crt',
      },
    });
  }
}
```

## Events

`RESTler` is an event emitter. Subscribe with `on` / `once` / `off`.

| Event            | Fires when                                | Handler arguments                      |
| ---------------- | ----------------------------------------- | -------------------------------------- |
| `call`           | After every request (success or failure)  | `(vendor, request, response, error?)`  |
| `authFailure`    | Response status is 401, 403, or 407       | `(vendor, request, response)`          |
| `rateLimit`      | Response status is 429                    | `(vendor, limit?, reset?, remaining?)` |
| `authentication` | Your subclass authenticates (you emit it) | `(vendor, data?)`                      |
| `track`          | Custom tracking (you emit it)             | `(vendor, name, data)`                 |

On a `rateLimit`, RESTler reads `x-ratelimit-limit` / `-remaining` / `-reset`
(and the unprefixed variants) from the response headers.

The `request` handed to `call` and `authFailure` — and the copy stored on a
`RESTlerError`'s `context` — is redacted so nothing sensitive leaks into logs:

- Sensitive header values (`Authorization`, `Cookie`, `Proxy-Authorization`,
  `X-Api-Key`, `X-Auth-Token`, `PRIVATE-TOKEN`, `X-Amz-Security-Token`) are
  replaced with `[REDACTED]`.
- `url` query-string values are replaced with `[REDACTED]` (keys are kept) and
  any `user:pass@` userinfo is stripped — so an API key injected via the query
  string (see [Authentication](#authentication)) never appears. The same
  redaction is applied to the `url` on the `response` copy handed to those
  events.
- The `payload` is omitted entirely (a request body is arbitrary in shape and
  may itself carry credentials).

This also covers an error your `_responseHandler` throws: the `request`
recorded in a thrown `RESTlerError`'s `context` is redacted the same way
before the error is re-thrown to the caller or handed to `call`. (A credential
you place under a different `context` key, or interpolate into the error
message text yourself, is outside what the library can redact.)

When `fetch` itself fails (DNS, TLS, connection refused), some runtimes embed
the full request URL — query-string credential and all — in the transport
error's `message` and `stack` (Deno nests it inside `TypeError: fetch failed`).
That transport error is preserved as the wrapped `RESTlerRequestError`'s
`cause`, but the request URL is scrubbed from its whole chain first, so even a
cause-expanding logger — `console.error(err)`, `util.inspect`,
`Deno.inspect(err, { depth })` — never prints the credential. The error's type
and stack are otherwise unchanged (`err.cause instanceof TypeError` still
holds), and a failure carrying no query-string/userinfo secret is left intact
for debugging.

The request actually sent over the wire is unaffected.

A throwing or rejecting event listener never corrupts a request. Each `call`,
`authFailure`, and `rateLimit` listener runs in isolation: a listener's
synchronous exception is contained, and an `async` listener's rejection is
caught (so it never escapes as an unhandled rejection that would terminate the
process). Either way the listeners registered after it still run, and the
request's own success or error is unaffected — so a bug in a monitoring or
metrics listener can neither reject a successful response, mask the real error,
nor silence the other listeners.

```typescript
import { RESTler } from '@tundralibs/restler';

class GitHubAPI extends RESTler {
  public readonly vendor = 'github';

  constructor(token: string) {
    super({
      baseURL: 'https://api.github.com',
      auth: { type: 'BEARER', token },
    });
  }
}

declare const token: string;

const api = new GitHubAPI(token);

api.on('rateLimit', (vendor, limit, reset, remaining) => {
  console.warn(
    `[${vendor}] rate limited: ${remaining}/${limit}, resets ${reset}`,
  );
});

api.on('call', (vendor, request, response) => {
  console.debug(
    `[${vendor}] ${request.method} ${request.url} -> ${response.status}`,
  );
});
```

## Observability

RESTler imports no logging or tracing package — observability wires up at
the application's **composition root** through two generic constructor
options, plus the events above. The vendor client stays
observability-agnostic; it just lets the hooks flow through to `super`
(the `RESTlerHooks` type is exported for exactly this):

```typescript
import { RESTler, type RESTlerHooks } from '@tundralibs/restler';

declare const token: string;
declare const tracer: {
  wrapClient: RESTlerHooks['witness'];
  propagation: RESTlerHooks['headerProvider'];
};

class GitHubAPI extends RESTler {
  public readonly vendor = 'github';

  constructor(token: string, hooks: RESTlerHooks = {}) {
    super({
      baseURL: 'https://api.github.com',
      auth: { type: 'BEARER', token },
      ...hooks, // witness? headerProvider? — never inspected here
    });
  }

  getUser(login: string) {
    return this._makeRequest<{ id: number; login: string }>({
      path: `/users/${login}`,
      method: 'GET',
    });
  }
}

// The app wires observability once; domain calls don't change:
const api = new GitHubAPI(token, {
  witness: tracer.wrapClient, // a CLIENT span per outbound request
  headerProvider: tracer.propagation, // traceparent per request (tracer >= 0.5)
});
const res = await api.getUser('octocat'); // traced + propagated, nothing new here
```

**`witness`** — the suite's [Witness convention](../norm/README.md#tracing-witness)
(shared shape with norm): every request runs through the hook with a
span-style name (`restler.github GET`) and low-cardinality attributes
(vendor, method, raw path — never the resolved URL or query string, which
can carry credentials). A witness observes and must not interfere: it calls
the wrapped `fn` exactly once, returns its result unchanged, and re-throws
its errors.

**`headerProvider`** — a per-request thunk whose headers go out on the wire,
layered `defaults < provider < endpoint.headers` (auth always wins). It runs
**inside the witnessed window**, which is the property propagation depends
on: `tracer.propagation` reads the active span at send time, so the
`traceparent` carries _that request's_ span id and the downstream service
joins the trace correctly parented. A throwing provider is contained — the
request proceeds without its headers. It is not tracing-specific:

```typescript ignore
headerProvider: () => ({
  'x-correlation-id': String(ambient.get()?.correlationId ?? ''),
}),
```

**Correlated logs.** Event listeners fire inside the calling request's async
context, so a logger wired with a `contextProvider`
([ambient](../ambient/README.md) request bag, trace identity via
`tracer.logContext`) stamps correlation ids on every line a listener emits —
no argument threading. See
[Slogger-Correlation](../slogger/docs/Slogger-Correlation.md).

For the raw-`fetch` shape these hooks replace — or clients not built on
RESTler — see
[Outbound: propagating the trace](../tracer/docs/Tracer-Recipes.md#outbound-propagating-the-trace).

## Vendor Response Handling

Some APIs report failures inside a successful HTTP response — a `200` whose
body is `{ "ok": false, "error": "…" }`, or a success envelope wrapping the
real data. Others just don't guarantee their response actually matches what
you expect — a vendor's contract can silently change. `_makeRequest`'s second
argument is an OPTIONS bag with two independently optional hooks that compose
into one pipeline, plus `skipAuth` (see
[OAuth2 token exchange](#oauth2-token-exchange-skipauth)):

```typescript ignore
_makeRequest(endpoint, {
  responseHandler?: (response) => H | Promise<H>,
  responseSchema?: (data: H) => B | Promise<B>,
  skipAuth?: boolean,
})
```

```
raw parsed body
  → if responseHandler present: data = await responseHandler(response)   // full response — status/headers visible, not just body
  → if responseSchema present:  data = await responseSchema(data)        // data = raw body if no handler ran, handler's output otherwise
  → response.body = data
```

Neither present → today's default (the parsed body, untouched). Only one
present → its result is final. Both present → the handler's output feeds the
schema.

### `responseHandler`

Runs on every response — error statuses and empty bodies included — so it
can translate a vendor convention. It receives the FULL `RESTlerResponse`
(status/headers included, not just the body):

- **throw** to reject the request (throw a `RESTlerError` subclass to surface
  it unwrapped; other errors are wrapped in `RESTlerRequestError` with the
  original as `cause`), or
- **return** the value the request resolves to — an unwrapped envelope, or
  simply `response.body` unchanged if nothing needs transforming. There is
  no mutate-in-place channel; the return value IS the result.

Set a vendor-wide default via the protected `_responseHandler` field, or pass
`responseHandler` per call (which takes precedence entirely — it does not
compose with the vendor default; only one of the two ever runs).

```typescript
import { RESTler, RESTlerRequestError } from '@tundralibs/restler';
import type { RESTlerResponseHandler } from '@tundralibs/restler';

type Envelope = { ok: boolean; data?: unknown; error?: string };

class PaymentAPI extends RESTler {
  public readonly vendor = 'payments';

  // Every endpoint of this vendor shares the same envelope convention.
  protected override _responseHandler: RESTlerResponseHandler = (response) => {
    const body = response.body as Envelope;
    if (body?.ok === false) {
      throw new RESTlerRequestError(`Vendor error: ${body.error}`, {
        vendor: this.vendor,
        request: { url: response.url, method: 'GET', timeout: 30 },
      });
    }
    return body?.data; // unwrap: callers see the payload directly
  };

  constructor() {
    super({ baseURL: 'https://api.payments.example' });
  }

  getBalance(account: string) {
    return this._makeRequest<{ balance: number }>({
      path: `/accounts/${account}/balance`,
      method: 'GET',
    });
  }

  // A per-call handler overrides the vendor default when one endpoint
  // deviates from the convention. Must return `response.body` explicitly
  // to leave it unchanged.
  rawHealth() {
    return this._makeRequest({ path: '/health', method: 'GET' }, {
      responseHandler: (response) => response.body,
    });
  }
}
```

### `responseSchema`

A plain runtime validator/parser — `(data: H) => B | Promise<B>` — for the
value the request ultimately resolves to. `B` is INFERRED from the schema's
return type, so you no longer separately write out (and manually keep in
sync) a type argument that nothing actually checked against the wire.

**No coupling to any particular validation library** — a
[`@tundralibs/guardian`](https://jsr.io/@tundralibs/guardian) schema's own
`.parse` satisfies the signature directly, and so does any hand-rolled
function:

```typescript
import { RESTler } from '@tundralibs/restler';

class UserAPI extends RESTler {
  public readonly vendor = 'users';

  constructor() {
    super({ baseURL: 'https://api.example.com' });
  }

  getUser(id: string) {
    return this._makeRequest(
      { path: `/users/${id}`, method: 'GET' },
      {
        responseSchema: (data) => {
          // A real schema would be e.g. `(d) => UserSchema.parse(d)`.
          const d = data as { id: string; name: string };
          if (typeof d.id !== 'string') throw new Error('missing id');
          return { id: d.id, name: d.name };
        },
      },
    );
  }
}
```

A thrown validation error (a `GuardianError`, or whatever your schema
throws) surfaces as `RESTlerResponseValidationError` — distinct from a
transport failure or timeout: the request SUCCEEDED, but what came back
didn't match what you declared to expect. See
[Error Handling](#error-handling).

### Wrapped envelopes: a schema alone, no handler needed

`responseHandler` is not required to unwrap an envelope — a schema that
itself encodes the "wrapped or not" shape (e.g. via a discriminated union)
can validate the RAW body directly:

```typescript ignore
import { Guardian } from '@tundralibs/guardian';

const Envelope = <T>(inner: ReturnType<typeof Guardian.object>) =>
  Guardian.discriminatedUnion('status', [
    Guardian.object({ status: Guardian.literal('ok'), data: inner }),
    Guardian.object({ status: Guardian.literal('error'), error: ErrorSchema }),
  ]);

this._makeRequest(endpoint, {
  responseSchema: (data) => Envelope(UserSchema).parse(data),
});
```

A non-throw no longer implies success here — it means the response matched
ONE of the declared shapes. `response.body` is the real discriminated union;
narrow on it afterward (`if (response.body.status === 'error')`) with full
type safety, instead of being forced into exception-based control flow for
an expected error shape.

## Error Handling

`_makeRequest` rejects on transport failures (it attaches the error to
`response.error` and re-throws it). HTTP error statuses do not reject —
unless a [response handler](#vendor-response-handling) inspects the body and
throws, or a [response schema](#responseschema) rejects the response.

| Error                            | Thrown when                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RESTlerConfigError`             | Invalid client options or endpoint config (bad `baseURL`/`port`/`auth`/…).                                                                             |
| `RESTlerTimeoutError`            | The request exceeded `timeout`.                                                                                                                        |
| `RESTlerResponseValidationError` | `responseSchema` threw — the request succeeded, but the response didn't match what you declared to expect. The original error is preserved as `cause`. |
| `RESTlerRequestError`            | Any other failure while making the request. `RESTlerTimeoutError` and `RESTlerResponseValidationError` are both subclasses.                            |
| `RESTlerError`                   | Base class for all of the above.                                                                                                                       |

```typescript
import {
  RESTlerError,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@tundralibs/restler';

declare const api: {
  getUser(
    login: string,
  ): Promise<RESTlerResponse<{ id: number; login: string }>>;
};

try {
  const res = await api.getUser('octocat');
  if (res.status === 404) {
    console.log('not found');
  } else {
    console.log(res.body);
  }
} catch (err) {
  if (err instanceof RESTlerTimeoutError) {
    console.error('timed out');
  } else if (err instanceof RESTlerResponseValidationError) {
    // Retrying won't fix this the way retrying a timeout might — the
    // vendor's response no longer matches its declared contract.
    console.error(
      `response schema rejected it: ${(err.cause as Error)?.message}`,
    );
  } else if (err instanceof RESTlerError) {
    console.error(`request failed: ${err.message}`);
  } else {
    throw err;
  }
}
```

## API Reference

### `abstract class RESTler<O extends RESTlerOptions>`

Extend once per API vendor.

**Constructor:** `new (options: RESTlerOptions, defaults?: Partial<O>)` —
validates and stores options; `defaults` are applied where `options` omit them.

**Abstract members:**

- `vendor: string` — identifier used in events and errors.

**Protected members (used by / overridable in your subclass):**

- `_makeRequest<H, B>(endpoint: RESTlerEndpoint, options?: RESTlerRequestOptions<H, B>): Promise<RESTlerResponse<B>>`
  — perform a request. Throws `RESTlerTimeoutError` / `RESTlerResponseValidationError` /
  `RESTlerRequestError` / `RESTlerConfigError`. `options.responseHandler` and
  `options.responseSchema` compose into one pipeline; `options.skipAuth`
  skips `_authInjector` for this one call (see
  [Vendor Response Handling](#vendor-response-handling)).
- `_responseHandler?: RESTlerResponseHandler` — vendor-wide default response
  handler; `options.responseHandler` overrides it entirely (the two do not
  compose with each other).
- `_authInjector(endpoint): void | Promise<void>` — inject auth. Override for
  custom schemes; may be async. By the time it runs, `endpoint.headers`
  already holds the FULL outbound set (defaults + `headerProvider` +
  caller-explicit), so a signing scheme can sign everything actually sent.
- `_base64Utf8(value: string): string` — UTF-8-correct base64 encoding,
  identical across Deno/Bun/Node; reuse it in a `CUSTOM` auth override
  instead of reimplementing it.
- `_fetch: typeof fetch` — the `fetch` implementation (compat's by default).
  Override to supply a custom transport or a stub; plain `fetch` works for any
  request that doesn't use `socketPath` or `tls`.
- `_defaultHeaders`, `_authStatus` (`[401, 403, 407]`), `_rateLimitStatus`
  (`[429]`) — overridable defaults.

**Inherited (event emitter):** `on(event, handler)`, `once(...)`,
`off(...)`, `emit(...)`.

### Key types

- `RESTlerOptions` — client configuration (see [Configuration](#configuration)).
- `RESTlerEndpoint` — per-request config: `path` + `method` (required) plus
  optional `baseURL`, `port`, `version`, `auth`, `query`, `headers`, `timeout`,
  `responseType` (`'BLOB' | 'ARRAY_BUFFER'`, see
  [Binary Responses](#binary-responses)), and (for body methods)
  `contentType` + `payload`. `path` is NORMALIZED via `path.join` against the
  base URL (`//` collapses, `.`/`..` resolve) — percent-encode an opaque,
  caller-controlled segment (an object-storage key, a filename) yourself
  first if it could plausibly contain those sequences.
- `RESTlerResponse<T>` — `{ url, status, statusText, headers?, body?, error?, timeTaken }`.
- `RESTlerRequestOptions<H, B>` — `_makeRequest`'s options bag:
  `{ responseHandler?, responseSchema?, skipAuth? }`. See
  [Vendor Response Handling](#vendor-response-handling).
- `RESTlerResponseHandler<H>` —
  `(response: RESTlerResponse<unknown>) => H | Promise<H>`; the vendor hook
  described in [Vendor Response Handling](#vendor-response-handling).
- `RESTlerResponseSchema<H, B>` — `(data: H) => B | Promise<B>`; the runtime
  validator described in [`responseSchema`](#responseschema). Plain
  function, no coupling to any particular validation library.
- `RESTlerAuth` — `BASIC | BEARER | CUSTOM` discriminated union.
  `RESTlerAuthTypes` is the discriminator; `RESTlerAuthBasic`
  (`{ username, password }` — password may be empty, RFC 7617) and
  `RESTlerAuthBearer` (`{ token, prefix? }`) are the per-scheme payloads.
- `RESTlerContentType` — `'JSON' | 'XML' | 'FORM' | 'TEXT' | 'BLOB'`. `FORM`'s
  wire format depends on the payload's shape — see [Content Types](#content-types).
- `RESTlerMethod` — `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'`.
- `RESTlerEvents` — the event handler signatures.
- `RESTlerErrorMeta` — metadata carried by every `RESTlerError`: `vendor` plus
  error-specific fields (e.g. `key`/`value`, `request`).

## License

MIT
