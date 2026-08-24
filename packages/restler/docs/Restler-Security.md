# Restler: Security — Credential Redaction

Every request runs with real credentials on the wire — an `Authorization`
header, an API key in the query string, a token in the body. RESTler cannot
stop you from logging a request (via the `call`/`authFailure` events) or an
error (via `RESTlerError.context`), so it redacts the copies handed to both
**before** they reach your code. This page is the full contract: what's
covered, what deliberately isn't, and how to extend it.

> The request/response actually sent over the wire is never altered by any of
> this — only the copies handed to event listeners and error contexts are.

## What gets redacted, and from where

| Surface                                                                                                        | What's stripped                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `call` / `authFailure` event `request` argument                                                                | Sensitive headers, `url` query values + userinfo, `payload` (omitted entirely)                 |
| `call` / `authFailure` event `response` argument                                                               | `url` only (query values + userinfo) — `headers` and `body` pass through unchanged             |
| `RESTlerError.context.request` (any error `_makeRequest` throws, including one your `_responseHandler` throws) | Same as the event `request`: headers, `url`, `payload`                                         |
| A transport error's `cause` chain (DNS/TLS/connection failure)                                                 | The raw request URL is replaced with its redacted form in every `message`/`stack` in the chain |
| A `RESTlerConfigError`'s `context.value` (bad `auth`/`headers`/`tls` option)                                   | `auth.password`/`auth.token`, sensitive header values, `tls.key`/`tls.keyFile` PEM content     |

By default a header is "sensitive" if its name (case-insensitively) is one of
`Authorization`, `Cookie`, `Proxy-Authorization`, `X-Api-Key`, `X-Auth-Token`,
`PRIVATE-TOKEN`, or `X-Amz-Security-Token` — the standard credential headers
plus the common non-standard token headers a `CUSTOM`-auth override typically
sets. A redacted header's value becomes the literal string `[REDACTED]`; the
header name is kept, so a log still shows which headers were sent.

A redacted URL keeps its scheme/host/path and every query-string **key**, but
replaces every query-string **value** with `[REDACTED]` and strips any
`user:pass@` userinfo from the authority — so an API key injected via
`endpoint.query` (see [Authentication](../README.md#authentication)) never
appears, however it was carried.

```typescript
import { RESTler } from '@tundralibs/restler';
import type { RESTlerRequest, RESTlerResponse } from '@tundralibs/restler';

class VendorAPI extends RESTler {
  public readonly vendor = 'vendor';

  /** Test/demo seam: stub the transport without touching global `fetch`. */
  public setFetch(fn: typeof fetch): void {
    this._fetch = fn;
  }

  getSecret() {
    return this._makeRequest<{ ok: boolean }>({
      path: '/secret',
      method: 'GET',
    });
  }
}

const api = new VendorAPI({
  baseURL: 'https://api.example.com',
  auth: { type: 'BEARER', token: 'super-secret-token' },
});

let wireAuth: string | null = null;
let eventRequest: RESTlerRequest | undefined;
api.setFetch((_input, init) => {
  // The REAL request still carries the real token...
  wireAuth = new Headers(init?.headers as HeadersInit).get('authorization');
  return Promise.resolve(
    new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});
api.on(
  'call',
  (_vendor, request: RESTlerRequest, _response: RESTlerResponse) => {
    // ...but the event's copy never sees it.
    eventRequest = request;
  },
);

await api.getSecret();
console.log(wireAuth); // "BEARER super-secret-token"
console.log(eventRequest?.headers?.['Authorization']); // "[REDACTED]"
```

> **Not redacted:** the `payload` is omitted (not field-redacted) from the
> event/error copy — a request body is arbitrary in shape with no fixed set of
> secret-bearing keys to match, so dropping it entirely is the safe default.
> The **response**'s `headers` and `body` are never touched (only its `url`
> is) — a vendor that echoes a credential back in a response header or body
> is outside what this redaction covers. And a credential you interpolate
> into an error's **message text** yourself, or place under a non-standard
> `context` key, is likewise outside what the library can retroactively find.

## Extending the sensitive-header set

A vendor-specific credential header (a driver's own connection-string header,
a non-standard token header) isn't in the default set. Override
`_isSensitiveHeader` — the single seam every redaction site routes through —
and chain to `super` so the base credential headers stay covered:

```typescript
import { RESTler } from '@tundralibs/restler';
import type { RESTlerEndpoint, RESTlerRequest } from '@tundralibs/restler';

class InternalAPI extends RESTler {
  public readonly vendor = 'internal';

  public setFetch(fn: typeof fetch): void {
    this._fetch = fn;
  }

  protected override _isSensitiveHeader(name: string): boolean {
    return name.toLowerCase() === 'x-vendor-secret' ||
      super._isSensitiveHeader(name);
  }

  protected override _authInjector(endpoint: RESTlerEndpoint): void {
    endpoint.headers = { ...endpoint.headers, 'X-Vendor-Secret': 'shh' };
  }

  ping() {
    return this._makeRequest({ path: '/ping', method: 'GET' });
  }
}

const api = new InternalAPI({ baseURL: 'https://internal.example.com' });
api.setFetch(() => Promise.resolve(new Response('', { status: 200 })));

let redactedHeaders: RESTlerRequest['headers'];
api.on('call', (_vendor, request: RESTlerRequest) => {
  redactedHeaders = request.headers;
});

await api.ping();
console.log(redactedHeaders?.['X-Vendor-Secret']); // "[REDACTED]"
```

> Match case-insensitively: `_isSensitiveHeader` is called with the header
> name exactly as it appears on the outbound request, and a vendor may send
> any casing.

## Transport-failure `cause` chains

When `fetch` itself fails before a response arrives (DNS, TLS, connection
refused), some runtimes embed the **full** request URL — query-string
credential and all — directly in the transport error's `message`, and
therefore its `stack` (Deno nests it a level down inside `TypeError: fetch
failed`'s own `cause`). That error is preserved as the wrapped
`RESTlerRequestError`'s `cause` (and is the same object the `call` event's
4th argument points to), so without scrubbing, a cause-expanding logger —
`console.error(err)`, `util.inspect`, `Deno.inspect(err, { depth })` — would
still print the credential even though the redacted `context.request` doesn't
carry it.

RESTler scrubs every occurrence of the raw URL out of `message` and `stack`,
for every error reachable via `cause`, **in place** — so the chain keeps its
original error types and `instanceof` checks still hold; only the text
changes.

```typescript
import { RESTler, RESTlerRequestError } from '@tundralibs/restler';

class VendorAPI extends RESTler {
  public readonly vendor = 'vendor';
  public setFetch(fn: typeof fetch): void {
    this._fetch = fn;
  }
  ping(key: string) {
    return this._makeRequest({ path: '/ping', method: 'GET', query: { key } });
  }
}

const api = new VendorAPI({ baseURL: 'https://api.example.com' });
// Simulates a runtime that embeds the full failed URL — credential-bearing
// query string included — in its own transport error message (as Deno's
// `TypeError: fetch failed` does).
api.setFetch((input) => {
  throw new TypeError(`fetch failed: ${input}`);
});

try {
  await api.ping('abc-secret');
} catch (err) {
  if (err instanceof RESTlerRequestError) {
    console.log((err.cause as Error)?.message.includes('abc-secret')); // false
  }
}
```

> This scrub only rewrites the chain when the URL actually carried something
> sensitive (a query string or userinfo) — a failure whose URL has neither is
> left completely untouched, so genuine transport diagnostics (host, path,
> port) survive for debugging.

## Config errors redact secrets too

A `RESTlerConfigError` thrown for an invalid `auth`, `headers`, or `tls`
option carries the rejected value in its `context.value` — with
`auth.password`/`auth.token` masked, sensitive header values redacted, and a
`tls` private key (`key`/`keyFile`) masked, the same way a request's headers
are. A bad `baseURL`, `port`, `timeout`, `version`, `contentType`, or
`socketPath` carries its rejected value unmasked, since none of those are
credential-shaped.

## Known limitation: `RESTlerTimeoutError` message text

> `RESTlerTimeoutError.message` is currently a literal, un-interpolated
> string — it reads `Request timed out after ${request.timeout}s` verbatim
> (the `${...}` placeholder text, not the actual timeout value), because the
> source builds it with single quotes rather than a template literal. This
> doesn't affect redaction (the redacted `context.request` is still correct)
> or `instanceof` narrowing — only the message text is wrong. Match on
> `instanceof RESTlerTimeoutError`, not on parsing the message, until this is
> fixed upstream.
