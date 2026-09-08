# Errors

Every failure in rapid is a `RapidError` with a registered code, an HTTP
status, and one disclosure rule. This page is the reference: how anything
thrown becomes a response, what the client sees in each mode, every code and
when it is raised, and how to raise and read errors in your own code.

---

## TL;DR

- Throw `new RapidError('RAPID_…', { message?, details?, debug?, cause? })`
  anywhere — handler, middleware, hook. Rapid maps the code to a status and
  builds the response; you never write an error envelope by hand.
- Anything else thrown becomes `RAPID_UNHANDLED` (500) with its message and
  stack kept in `debug`, which **never** reaches a client in PRODUCTION.
- **4xx `message` and `details` are public.** They describe the client's own
  request and are sent verbatim in PRODUCTION. Write them as client-facing
  text.
- **Every 500 is opaque in PRODUCTION** — `Internal server error`, whatever
  its code; other 5xx keep their generic default (`Request timed out`).
- The same envelope goes out on every transport: JSON on HTTP, an error frame
  on sockets, a failed outcome on jobs; HTML when the UI layer resolves a
  request to a page.

---

## From a throw to a response

`RapidError.from(error)` normalises whatever a handler, middleware or hook
threw — in this order:

1. A `RapidError` is used as-is.
2. An `Error` carrying `context.code` that is a registered code (a rapid error
   re-imported across a realm boundary) is re-wrapped with its message,
   `details` and `debug`.
3. A `@tundralibs/guardian` validation failure — recognised structurally, no
   import — becomes `RAPID_VALIDATION_FAILED` (400) with one client-safe
   message per failing field under `details.fields`.
4. **Everything else** — a plain `Error`, a database driver's error, a
   `TypeError` from a bug, a rejected promise with a string — becomes
   `RAPID_UNHANDLED` (500). The original message and stack are stored under
   `debug`; the original error is the `cause`.

The transport then runs the shared cycle's `disclose()`: the error is logged
(a 5xx at `error` level with its stack and `debug`; a 4xx at `debug` level,
no stack — a scanner's 404s must not flood the error log), `app.onError` may
override the envelope, and the response is built from `payload(mode)`.

## What the client sees

|             | DEVELOPMENT        | PRODUCTION                                                                                       |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `status`    | the code's status  | the same — a status is never rewritten                                                           |
| `code`      | yes                | yes                                                                                              |
| `message`   | the thrown message | 5xx: the registry default (every **500** reads `Internal server error`); 4xx: the thrown message |
| `details`   | yes                | 5xx: dropped; 4xx: kept                                                                          |
| `debug`     | yes                | **never**                                                                                        |
| `requestId` | yes                | yes                                                                                              |

`mode` defaults to `PRODUCTION`; set `mode: DEVELOPMENT` (config or options)
for local work. The body always carries `requestId`, and so does the response
header (`headers.requestId`, default `x-request-id`), so a client's report can
be matched to the server log line.

```json
{
  "code": "RAPID_ACCESS_DENIED",
  "message": "Access denied",
  "details": { "module": "Posts", "permission": "EDIT" },
  "requestId": "13504782277023891456"
}
```

### Pitfalls

- **A 4xx is a public statement.** A 400 thrown with the message
  `user 42 not in table accounts` ships that text to the caller in
  PRODUCTION. Put internal detail in `debug`, never in the `message` or
  `details` of a 4xx.
- **Do not catch and re-throw as a string.** A thrown string becomes an opaque
  500 with the string in `debug` — correct, but you lose the code you meant.
- **Guardian on server-side data.** The structural recognition turns _any_
  guardian failure into a 400 — including one from validating a database row
  you read. Validate server data inside a `try` that rethrows a
  `RAPID_UNHANDLED`, or use a plain assertion, so a corrupt row is the 500 it is.
- **`app.onError` runs in the request's ambient scope** and may return a
  replacement `{ status, content }`; a hook that throws is logged and the
  default envelope is used. It cannot make a 500 leak `debug` — `payload()`
  has already been applied to what it receives.

## Code reference

The registry (`RAPID_ERROR_CODES`) — status, PRODUCTION message, and when
rapid raises it. Codes marked _specific_ are never derived from a bare status
(a handler that sets `status: 422` on its own reply is not an idempotency
mismatch); they are only ever thrown by name.

| Code                            | Status | PRODUCTION message                                       | Raised when                                                                                                                                                                                                    |
| ------------------------------- | ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RAPID_UNHANDLED`               | 500    | Internal server error                                    | Anything thrown that is not a `RapidError` or a guardian failure. The real message/stack live in `debug`.                                                                                                      |
| `RAPID_CONFIG`                  | 500    | Internal server error                                    | A bad option at boot or at a factory (`cors({ maxAge: -1 })`, `timeout(0)`, an unknown `authorize()` module). Thrown at `initialize()`/`start()` or when the middleware is built — never on the first request. |
| `RAPID_VALIDATION_FAILED`       | 400    | Request validation failed                                | A guardian schema failed (`details.fields`), a malformed JSON/form body, a rejected encrypted payload (`details.reason`).                                                                                      |
| `RAPID_QUERY_INVALID`           | 400    | Invalid query                                            | The query string breached `server.query` caps (filters, sorts, value length, array items).                                                                                                                     |
| `RAPID_RESPONSE_INVALID`        | 500    | Internal server error                                    | A reply rapid cannot send: a redirect that would leave the origin, a 1xx status, a bad cookie name, a handler writing after `respond()`.                                                                       |
| `RAPID_TEMPLATE_RENDER`         | 500    | Internal server error                                    | A UI template, layout, `title`/`meta` callback or view projection threw while rendering.                                                                                                                       |
| `RAPID_UNAUTHENTICATED`         | 401    | Authentication required                                  | No usable credential (`pactAuth` with `optional: false`, `authorize()` on an anonymous request, a login route rejecting a password).                                                                           |
| `RAPID_ACCESS_DENIED`           | 403    | Access denied                                            | A valid principal lacks the permission (`details: { module, permission }`).                                                                                                                                    |
| `RAPID_CSRF_INVALID`            | 403    | CSRF token invalid                                       | A state-changing request without a valid, session-bound CSRF token (`csrf()`).                                                                                                                                 |
| `RAPID_NOT_FOUND`               | 404    | Not found                                                | No route matched — including a page or UI runtime route requested on the api surface.                                                                                                                          |
| `RAPID_METHOD_NOT_ALLOWED`      | 405    | Method not allowed                                       | The path exists for other methods (`details.allow`, mirrored in the `Allow` header).                                                                                                                           |
| `RAPID_CONFLICT`                | 409    | Conflict                                                 | Free for app use — a generic state conflict.                                                                                                                                                                   |
| `RAPID_IDEMPOTENCY_KEY_INVALID` | 400    | Idempotency key invalid                                  | _specific_ — the `Idempotency-Key` header exceeds 255 characters.                                                                                                                                              |
| `RAPID_IDEMPOTENCY_IN_FLIGHT`   | 409    | A request with this idempotency key is already in flight | _specific_ — the key's first attempt has not finished (or was cut off by `timeout()` and is still detached).                                                                                                   |
| `RAPID_IDEMPOTENCY_MISMATCH`    | 422    | Idempotency key reused with a different request          | _specific_ — the key was first used with another method, path or body (fingerprint differs).                                                                                                                   |
| `RAPID_PAYLOAD_TOO_LARGE`       | 413    | Payload too large                                        | The body exceeded `server.maxBodySize`, a file exceeded `uploads.maxSize`, or more than `uploads.maxFiles` parts.                                                                                              |
| `RAPID_UNSUPPORTED_MEDIA`       | 415    | Unsupported media type                                   | An upload's extension is not in `uploads.allowedExtensions`, or its bytes do not match its extension.                                                                                                          |
| `RAPID_TIMEOUT`                 | 504    | Request timed out                                        | `timeout(seconds)` fired. The work keeps running detached — see the middleware catalog.                                                                                                                        |
| `RAPID_RATE_LIMITED`            | 429    | Too many requests                                        | `rateLimit()` budget exceeded (`retry-after` set).                                                                                                                                                             |
| `RAPID_UPLOADS_UNAVAILABLE`     | 501    | File uploads are not available in this runtime           | A multipart upload reached a runtime without a filesystem (Workers, browser).                                                                                                                                  |

The `RAPID_` prefix is reserved for the framework.

## Raising errors in your code

```ts
import { RapidError } from '@tundralibs/rapid';

declare const orders: { find(id: string): Promise<{ owner: string } | null> };
declare const me: string;

async function loadOrder(id: string) {
  const order = await orders.find(id);
  if (order === null) {
    // 4xx: message + details are PUBLIC — say what the client can act on.
    throw new RapidError('RAPID_NOT_FOUND', {
      message: 'No such order',
      details: { id },
    });
  }
  if (order.owner !== me) {
    // Internal reasoning goes in `debug`: never rendered in PRODUCTION.
    throw new RapidError('RAPID_ACCESS_DENIED', {
      debug: { owner: order.owner, caller: me },
    });
  }
  return order;
}
```

`details` is a plain JSON-serialisable object (BigInt and functions are not
allowed — they would fail serialisation and turn the response into a 500).
`cause` keeps the original error for the server log.

## Reading errors

- **Server log.** Every 5xx logs `message`, `code`, `requestId`, `stack` and
  `debug` at `error`; every 4xx logs `message`, `code`, `requestId` at
  `debug`; and the access line (`logger.access`) carries the `code` with the
  status and duration. Correlate on `requestId`.
- **In tests.** `app.fetch(new Request(...))` returns the JSON envelope;
  `app.triggerJob('name')` returns an outcome with `status`; a socket command
  rejects with `{ code, message, data? }`.
- **`RapidError.from(x)`** is exported for app-level boundaries (a queue
  consumer, a CLI) that want the same normalisation.

## Sockets and jobs

A socket command's failure rides rpc's error frame as `{ code, message,
data? }`. A framework error keeps its code; a handler-authored error reply
(a `{ status: 422, content: {...} }` returned from the handler) gets a code
derived from its status class — `RAPID_VALIDATION_FAILED` for 4xx,
`RAPID_UNHANDLED` for 5xx — and keeps its content as `data`, so a socket
client learns the same thing an HTTP client would. A job's failure becomes
its outcome's `status` and is logged the same way; `app.triggerJob()` returns
it instead of throwing.

---

[← Back to rAPId](../README.md)
