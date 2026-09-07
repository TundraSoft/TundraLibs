# Middleware

Drop-in transport adapters: one factory per framework — express, fastify,
oak, hono — returning `{ authenticate, authorize }` over one pact instance
and one options bag. `authenticate` extracts the credential, calls
`pact.authenticate`, and attaches the auth context; `authorize(module,
permission)` is the per-route guard, typed by the instance. Every carrier
(header, scheme prefix) defaults to the standard and is configurable; the
HMAC scheme signs both directions over an RFC 9421-style template; API-key
callers can exchange JWE-encrypted payloads. The neutral core
(`createPactMiddleware`) makes any other stack a few lines of glue. The
adapters are structural: pact depends on none of the frameworks.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

## Table of Contents

- [What every adapter does](#what-every-adapter-does)
- [Options](#options)
- [Carriers](#carriers)
- [express](#express)
- [fastify](#fastify)
- [oak](#oak)
- [hono](#hono)
- [Signed exchanges (HMAC)](#signed-exchanges-hmac)
- [Encrypted payloads (JWE)](#encrypted-payloads-jwe)
- [Writing your own adapter](#writing-your-own-adapter)

## What every adapter does

| Step          | Behavior                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build         | `const { authenticate, authorize } = <framework>Pact(pact, options)` — once, at module load; a bad option or template throws here                                |
| Extract       | `Authorization: Bearer` / `Basic` / `ApiKey key:secret`, plus `x-key-id` + `x-signature` + `x-timestamp` when HMAC is on — see [Carriers](#carriers)             |
| No credential | 401 `{ "error": "NO_CREDENTIALS" }` — or pass through unauthenticated when `optional`                                                                            |
| Authenticate  | `pact.authenticate(credential)`; the context attaches to the request (`req.pact`, `request.pact`, `ctx.state.pact`, `c.get('pact')`)                             |
| Auth failure  | 401 with the stable code (`INVALID_CREDENTIALS`, `SESSION_EXPIRED`, `STALE_TIMESTAMP`, ...) — a presented credential that fails is NEVER downgraded to anonymous |
| Challenge     | Every 401 carries `WWW-Authenticate` — one challenge per accepted scheme, `realm` when set (`challenge: false` to suppress)                                      |
| Payload       | With `encryption` on, a key-authenticated `application/jose` body is decrypted for the handler (400 `ENCRYPTION_INVALID` when it cannot be)                      |
| Guard         | `authorize(module, permission)` asserts on the attached bound principal — 403 `PERMISSION_DENIED` on refusal, 401 when unauthenticated                           |
| Typing        | `authorize` takes the instance's own module names and permission keys; the catalog is checked when the guard is built, so a typo fails at boot                   |
| Respond       | After the handler, an HMAC caller's response is signed and a JWE-capable caller's response is encrypted — same key, same template rules; nothing else is touched |
| Other errors  | Handed to the framework (express `next(error)`; the rest rethrow)                                                                                                |

The attached principal is a bound principal: route handlers can call
`principal.hasPermission(...)`/`assert(...)` directly for checks beyond
the guard, at no store round-trip.

## Options

The factory's `PactMiddlewareOptions` — one bag both halves share:

| Option       | Default                                                      | Meaning                                                                                                  |
| ------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `schemes`    | `['BEARER', 'BASIC', 'APIKEY']` (+ `'HMAC'` when `hmac` set) | Accepted carriers; others read as absent                                                                 |
| `optional`   | `false`                                                      | Missing credential continues unauthenticated (invalid ones still 401)                                    |
| `challenge`  | `true`                                                       | Send `WWW-Authenticate` on every 401                                                                     |
| `realm`      | —                                                            | The `realm` parameter of those challenges                                                                |
| `bearer`     | `{ header: 'authorization', prefix: 'Bearer' }`              | Where the session token travels                                                                          |
| `basic`      | `{ header, prefix: 'Basic', credential: 'user' }`            | Where the `id:secret` pair travels, and what it is (`'user'` or `'apiKey'`)                              |
| `apiKey`     | `{ header: 'authorization', prefix: 'ApiKey' }`              | One prefixed header holding `keyId:secret`, or `{ keyHeader, secretHeader }` for two                     |
| `hmac`       | —                                                            | Enables the HMAC scheme — headers, templates, algorithm, `maxSkew`; see [below](#signed-exchanges-hmac)  |
| `encryption` | —                                                            | `{ enc?, required? }` — JWE payloads for key-authenticated callers; see [below](#encrypted-payloads-jwe) |

## Carriers

Each scheme has one carrier, defaulting to its standard: Bearer (RFC 6750)
and Basic (RFC 7617) on `Authorization`; `ApiKey keyId:secret` on
`Authorization` as the common convention (there is no IETF standard for API
keys). Override only to match clients you do not control:

```ts ignore
const { authenticate } = expressPact(pact, {
  bearer: { header: 'x-session-token', prefix: '' }, // bare token, own header
  basic: { credential: 'apiKey' }, // `Basic base64(keyId:secret)` = an API key
  apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
});
```

Prefixes match case-insensitively; a prefix of `''` reads the whole header
as the value. `basic.credential: 'apiKey'` authenticates the pair as an API
key (`via: 'APIKEY'`) — the `schemes` list still gates it under `'BASIC'`,
the carrier's name. A key id + secret presented this way is a plain API-key
call; a key id + signature with no secret on the wire is HMAC.

## express

```ts ignore
import express from 'express';
import { expressPact } from '@tundralibs/pact/middleware/express';

const { authenticate, authorize } = expressPact(pact);
const app = express();
app.use(authenticate);

app.get('/projects', authorize('Projects', 'READ'), (req, res) => {
  res.json({ user: req.pact.principal.id });
});

// Sessions-only route group, anonymous browsing allowed:
const shop = expressPact(pact, { schemes: ['BEARER'], optional: true });
app.use('/shop', shop.authenticate);
```

The context attaches as `req.pact`. Non-pact errors go to `next(error)`
and your express error handler. The signed path and query come from
`req.originalUrl`, so mounting under a prefix is fine. For the body-bound
features (HMAC body digest, encryption) the adapter reads `req.rawBody`
when your parser kept it —
`express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` —
else `req.body` when it is a string or buffer (`express.text()`,
`express.raw({ type: 'application/jose' })`). A decrypted payload lands on
`req.pactBody`. When a response must be signed or encrypted, `res.json(...)`
is wrapped so the JSON it sends (plain `JSON.stringify` — `json spaces` and
`json replacer` do not apply) is sealed; other send paths go out as-is, and
`res.json` returns before the bytes are written. Express appends
`; charset=utf-8` to the `application/jose` type and answers conditional
GETs with a bodyless 304 whose signature cannot verify — set
`app.set('etag', false)` or `Cache-Control: no-store` on signed routes.

## fastify

```ts ignore
import Fastify from 'fastify';
import { fastifyPact } from '@tundralibs/pact/middleware/fastify';

const { authenticate, authorize, respond } = fastifyPact(pact);
const app = Fastify();
app.addHook('preHandler', authenticate); // global
app.addHook('onSend', respond); // only acts on signed/encrypted callers

app.get('/projects', {
  preHandler: authorize('Projects', 'READ'), // per-route
}, async (request) => ({ user: request.pact.principal.id }));
```

The context attaches as `request.pact`. Register per-route instead of
globally by putting `authenticate` in that route's `preHandler` array.
`respond` is an `onSend` hook: it signs/encrypts the serialized payload
for the callers `authenticate` marked and returns everything else
untouched. The raw body comes from `request.rawBody` (a content type
parser with `parseAs: 'buffer'`, or the raw-body plugin) else a
string/buffer `request.body`; register a parser for `application/jose` to
receive encrypted payloads, which land decrypted on `request.pactBody`.

## oak

```ts ignore
import { Application, Router } from '@oak/oak';
import { oakPact } from '@tundralibs/pact/middleware/oak';

const { authenticate, authorize } = oakPact(pact);
const router = new Router();
router.get(
  '/projects',
  authenticate,
  authorize('Projects', 'READ'),
  (ctx) => {
    ctx.response.body = { user: ctx.state.pact.principal.id };
  },
);
```

The context attaches as `ctx.state.pact`. When a body-bound feature needs
the request body the adapter consumes oak's stream and sets
`ctx.state.pactBody` — the decrypted payload, or the raw bytes — so read
it from there on such routes. After `next()`, strings, byte views,
primitives, and `URLSearchParams` are signed as oak sends them; a plain
object is serialized by the adapter (plain `JSON.stringify`, without an
app-level `jsonBodyReplacer`) so the signed bytes are the sent bytes, and
its type is set only when the handler set none; streams, blobs, forms,
files, and async iterables are sent unsigned. The
[oauth-signin example](../examples/oauth-signin/README.md) runs this
adapter over live HTTP.

## hono

```ts ignore
import { Hono } from 'hono';
import { honoPact } from '@tundralibs/pact/middleware/hono';
import type { PactAuthContext } from '@tundralibs/pact';

const { authenticate, authorize } = honoPact(pact);
const app = new Hono();
app.use(authenticate);

app.get('/projects', authorize('Projects', 'READ'), (c) => {
  const auth = c.get('pact') as PactAuthContext;
  return c.json({ user: auth.principal.id });
});
```

The context attaches via `c.set('pact', ...)`, a decrypted payload via
`c.set('pactBody', ...)`; hono caches the request body, so handlers can
still read it. The signed path is the URL's encoded pathname, not hono's
decoded `c.req.path`. When a response must be signed or encrypted the
adapter reads the whole body and replaces `c.res` — a `Response` body is
always a stream, so only `text/event-stream` is exempt: do not stream
large or long-lived bodies to HMAC or JWE callers on hono.
Hono runs on Workers, where pact's fetch-based surface (JWT sessions,
external caches over HTTP drivers) is the natural fit.

## Signed exchanges (HMAC)

`hmac: {}` turns the scheme on with standard defaults. The client sends the
key id, a signature over the rendered request template, and a timestamp;
the secret never travels. The server verifies, runs the handler, and signs
the response over the response template with the same key — the client
verifies that with the secret it holds. Response signing is on by default
(`response: false` turns it off).

| Header (configurable) | Default       | Carries                                                                                        |
| --------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `keyHeader`           | `x-key-id`    | The API key id                                                                                 |
| `signatureHeader`     | `x-signature` | Hex HMAC, request and response                                                                 |
| `timestampHeader`     | `x-timestamp` | Integer Unix seconds; missing, malformed, or outside `maxSkew` (300 s) → 401 `STALE_TIMESTAMP` |
| `nonceHeader`         | `x-nonce`     | Optional client nonce, echoed on the response (a nonce store is on the roadmap)                |

Templates name RFC 9421 components inside `${…}`; anything between them is
literal separator text. Keys are frozen — renaming a header does not rename
its key — and the template is compiled at boot: an unknown key, a
non-lowercase key, a response-only key in a request template, a missing
mandatory key, or two keys with nothing between them throws
`INVALID_OPTION`. The separator rule keeps the signed string unambiguous
(`${@path}${x-tenant}` would let `/a` + `foo` collide with `/afoo`); the
pairs whose boundary is self-evident — `${@path}${@query}`,
`${@authority}${@path}`, `${@authority}${@request-target}` — are allowed.

| Key                  | Request   | Response  | Value                                                                         |
| -------------------- | --------- | --------- | ----------------------------------------------------------------------------- |
| `${@method}`         | mandatory | optional  | Uppercase method                                                              |
| `${@path}`           | mandatory | optional  | Path, byte-exact, no query                                                    |
| `${@query}`          | optional  | optional  | Raw query with its leading `?`, or empty — no sorting, no re-encoding         |
| `${@request-target}` | optional  | —         | `${@path}${@query}`                                                           |
| `${@authority}`      | optional  | —         | `host[:port]`, lowercased                                                     |
| `${@scheme}`         | optional  | —         | `http` / `https`, lowercased                                                  |
| `${@target-uri}`     | optional  | —         | `${@scheme}://${@authority}${@request-target}`                                |
| `${@status}`         | —         | mandatory | Response status code                                                          |
| `${x-timestamp}`     | mandatory | mandatory | The request's timestamp header / the server's stamp on the response           |
| `${x-nonce}`         | optional  | optional  | The request's nonce header, empty when absent                                 |
| `${x-key-id}`        | optional  | optional  | The key id                                                                    |
| `${content-digest}`  | mandatory | mandatory | RFC 9530 `sha-256=:<base64>:` over the exact body bytes — empty body included |
| `${<header>}`        | optional  | —         | Any other request header by lowercase name, comma-joined, empty when absent   |

Defaults:

```ts ignore
template: '${@method}\n${@path}${@query}\n${x-timestamp}\n${content-digest}',
response: '${@status}\n${x-timestamp}\n${content-digest}',
```

A client signs the request like this (the server's `signFor` is the same
computation with the stored secret):

```ts
import { signHMAC } from '@tundralibs/crypt/sign';
import { encodeBase64 } from '@std/encoding';

async function signedFetch(
  url: string,
  init: { method: string; body?: string },
  key: { id: string; secret: string },
): Promise<Response> {
  const { pathname, search } = new URL(url);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bytes = new TextEncoder().encode(init.body ?? '');
  const digest = `sha-256=:${
    encodeBase64(await crypto.subtle.digest('SHA-256', bytes))
  }:`;
  const method = init.method.toUpperCase();
  const payload = `${method}\n${pathname}${search}\n${timestamp}\n${digest}`;
  return await fetch(url, {
    ...init,
    headers: {
      'x-key-id': key.id,
      'x-timestamp': timestamp,
      'x-signature': await signHMAC(payload, key.secret),
    },
  });
}
```

`algorithm` (`SHA-256` default, `SHA-384`, `SHA-512`) is fixed per
deployment and never read off the request. The default response template
does not include the nonce: add `${x-nonce}` to `response` when a client
must bind each reply to the request it sent. A custom template can add
`${@authority}` (pins the host), `${x-nonce}`, or a tenant header:

```ts ignore
hmac: {
  template: '${@method}\n${@target-uri}\n${x-timestamp}\n${x-nonce}\n${content-digest}',
  response: '${@status}\n${x-nonce}\n${x-timestamp}\n${content-digest}',
  maxSkew: 60,
}
```

## Encrypted payloads (JWE)

`encryption: {}` lets a key-authenticated caller (API key or HMAC — a
session token holds no shared secret) send its body as a compact JWE and
receive the response body the same way. Direct encryption (`alg: dir`) with
AES-GCM; the content key is HKDF-derived from the key's secret, salted with
the key id and labelled with the `enc`, so the raw secret never keys a
cipher; the protected header is the AEAD's additional data.

```
Content-Type: application/jose

eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoicGtfYWtfNzMifQ..
<base64url iv>.<base64url ciphertext>.<base64url tag>
```

The header decodes to `{"alg":"dir","enc":"A256GCM","kid":"pk_ak_73"}`;
the second segment (encrypted key) is empty under `dir`. The server accepts
only the configured `enc` (`A256GCM` default, or `A128GCM`) and only a
`kid` equal to the authenticated key id — anything else, a bad tag
included, is a 400 `ENCRYPTION_INVALID`. `required: true` also rejects a
plaintext body from such a caller (judged by the framing headers when a
body parser consumed the stream before the adapter). The response is
encrypted for a caller who showed it can read one — it sent a JWE, sent
`Accept: application/jose`, or `required` is on; a plaintext API-key call
gets a plaintext reply. Combined with HMAC, `${content-digest}` covers the
JWE string as sent, in both directions. One AES-GCM key serves a key id for
its lifetime (random 96-bit IVs), so rotate API keys well inside the
2^32-message bound.

Clients encrypt with the same derivation — `hkdf(secret, { salt: keyId,
info: 'pact-jwe-A256GCM', length: 32 })` from `@tundralibs/crypt/generators`
— and `kid: keyId`; on the server, `pact.encryptFor` / `pact.decryptFor`
expose the operation for anything outside the middleware.

## Writing your own adapter

The core is one factory from `@tundralibs/pact/middleware`: it returns the
two halves as pure functions over a request view and an auth context, plus
the shared challenge. `{ method, path, header }` is enough for the plain
schemes; add `query`, `authority`, `scheme`, and `body()` when you turn on
HMAC or encryption. An ok verdict then carries the decrypted `body` and a
`respond()` to run on the finished response:

```ts ignore
import { createPactMiddleware } from '@tundralibs/pact/middleware';

const core = createPactMiddleware(pact, { hmac: {}, encryption: {} });

async function myAuth(
  req: MyRequest,
  res: MyResponse,
  pass: () => Promise<void>,
) {
  const verdict = await core.authenticate({
    method: req.method,
    path: req.url.pathname,
    query: req.url.search,
    authority: req.url.host,
    scheme: req.url.protocol.replace(/:$/, ''),
    header: (name) => req.headers.get(name),
    body: () => req.bytes(), // raw bytes, byte-exact; called at most once
  }); // throws only for non-pact errors — let the framework handle those
  if (!verdict.ok) {
    const { status, body, headers } = verdict.denial; // headers: www-authenticate on 401
    return res.send(status, body, headers);
  }
  req.auth = verdict.auth; // undefined when absent and optional
  req.payload = verdict.body; // decrypted, when the request was a JWE
  await pass();
  if (verdict.respond !== undefined && !res.isStream) {
    const patch = await verdict.respond({
      status: res.status,
      body: res.bytes,
    });
    res.setHeaders(patch.headers); // x-signature, x-timestamp, content-type
    if (patch.body !== undefined) res.bytes = patch.body; // the JWE
  }
}

const guard = core.authorize('Projects', 'READ'); // typed; catalog-checked here
async function myGuard(req: MyRequest, res: MyResponse, pass: () => void) {
  const denial = await guard(req.auth);
  if (denial !== undefined) {
    return res.send(denial.status, denial.body, denial.headers);
  }
  pass();
}
```

`respond()` throws `PactError` (`INVALID_CREDENTIALS` / `NOT_ACTIVE`) when
the key was revoked between the request and the response — let the
framework's error path take it; the handler has already run.

The lower-level pieces remain exported: `resolveOptions` fills the
defaults and compiles the templates; `extractCredential` (async — the
body digest) turns a request view into a `PactCredential` without applying
the timestamp window — pair it with `isFreshTimestamp(value, maxSkew)`;
`compileTemplate`/`contentDigest` are the template engine;
`failureResponse` is the complete PactError → status mapping (401 for the
auth-failure codes, 403 `PERMISSION_DENIED`, 409 `USER_EXISTS`, 400
`ENCRYPTION_INVALID`, 500 otherwise) and doubles as an app-level error
boundary.

---

[← Back to Pact](../README.md)
