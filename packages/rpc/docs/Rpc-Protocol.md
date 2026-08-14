# Wire Protocol

JSON envelope used over the WebSocket between client and `Server`.
One frame per text message. Binary frames are rejected with
`BAD_FORMAT`.

## Table of Contents

- [Frame Anatomy](#frame-anatomy)
- [Inbound Frames (Client → Server)](#inbound-frames-client--server)
- [Outbound Frames (Server → Client)](#outbound-frames-server--client)
- [Validation at the Edge](#validation-at-the-edge)
- [Codec Functions](#codec-functions)
- [Error Codes](#error-codes)
- [Versioning](#versioning)

## Frame Anatomy

Every frame is a JSON object with a `type` discriminator. Most frames
also carry an `id` correlating request → response.

```jsonc
{
  "id": "req-1", // string, required on inbound; optional on outbound
  "type": "cmd" // string discriminator
  // …type-specific fields
}
```

The `id` is opaque to the server — pick whatever scheme you want
(monotonic counter, UUID, …). The server echoes it back in the
matching response frame.

## Inbound Frames (Client → Server)

### `cmd` — invoke a registered command

```jsonc
{
  "id": "1",
  "type": "cmd",
  "cmd": "createUser",
  "payload": { "name": "Ada", "email": "ada@example.com" }
}
```

| Field     | Required | Notes                                          |
| --------- | -------- | ---------------------------------------------- |
| `id`      | yes      | Non-empty string                               |
| `type`    | yes      | Must be `"cmd"`                                |
| `cmd`     | yes      | Non-empty string; matches a registered command |
| `payload` | no       | Any JSON value; passed to the validator        |

The server replies with a `result` frame carrying the same `id`.

### `sub` — subscribe to a channel

```jsonc
{
  "id": "2",
  "type": "sub",
  "channel": "chat:room1"
}
```

The server replies with `subscribed` (success) or `result` with
`ok: false` (refused via `authorize`, unknown channel, etc.).

### `unsub` — unsubscribe from a channel

```jsonc
{
  "id": "3",
  "type": "unsub",
  "channel": "chat:room1"
}
```

Always succeeds; replies with `unsubscribed`. Idempotent — calling
unsub when not subscribed is fine.

### `pub` — publish to a channel via its `onPublish` handler

```jsonc
{
  "id": "4",
  "type": "pub",
  "channel": "chat:room1",
  "payload": { "text": "hi" }
}
```

The frame triggers the channel's `onPublish` handler. By default,
channels do **not** accept client publishes — the response is a
`result` with `ok: false` and `code: PUBLISH_REFUSED` unless the
channel was registered with an `onPublish` callback.

## Outbound Frames (Server → Client)

### `result` — response to a `cmd` / `sub` / `pub`

Success:

```jsonc
{
  "id": "1",
  "type": "result",
  "ok": true,
  "data": { "id": "u-1" }
}
```

Failure:

```jsonc
{
  "id": "1",
  "type": "result",
  "ok": false,
  "error": { "code": "VALIDATION", "message": "name required" }
}
```

`data` is omitted when undefined. The `error` object always has `code`
and `message` strings, plus an **optional** `data` of structured detail
a handler chose to send along (field-level validation errors, a retry
hint, …):

```jsonc
{
  "id": "1",
  "type": "result",
  "ok": false,
  "error": {
    "code": "VALIDATION",
    "message": "name required",
    "data": { "fields": { "name": "required" } }
  }
}
```

A handler opts in by attaching `data` to the error it throws; the field
is omitted entirely when absent, so peers that predate it are
unaffected. `Client.command()` surfaces it as `.data` on the rejection
alongside `.code`:

```ts
import { Client } from '@tundralibs/rpc';

const client = new Client({ url: 'ws://localhost:8080' });
await client.connect();

try {
  await client.command('createUser', { email: 'nope' });
} catch (err) {
  const { code, data } = err as Error & { code?: string; data?: unknown };
  console.error(code, data); // 'VALIDATION' { fields: { name: 'required' } }
}
```

`error.data` crosses the wire to the caller, so it carries the same
disclosure duty as any error body — never put internals in it.

### `subscribed` / `unsubscribed`

```jsonc
{ "id": "2", "type": "subscribed",   "channel": "chat:room1" }
{ "id": "3", "type": "unsubscribed", "channel": "chat:room1" }
```

Confirms a `sub` / `unsub` request.

### `msg` — server-initiated broadcast

```jsonc
{
  "type": "msg",
  "channel": "chat:room1",
  "data": { "from": "u-1", "text": "hi" }
}
```

No `id` because it's not tied to a specific request. The client
identifies relevance by `channel`.

### `error` — out-of-band protocol error

```jsonc
{
  "id": "1",
  "type": "error",
  "code": "BAD_FORMAT",
  "message": "invalid frame"
}
```

`id` is included when it can be recovered from the offending inbound
frame, so the client can correlate the error to its outstanding request
and fail fast instead of waiting out the request timeout. Specifically:

- **`BAD_FORMAT`** — the frame was well-formed JSON carrying a non-empty
  string `id` but was otherwise malformed (unknown `type`, or a missing
  `cmd` / `channel` / `payload`): the `id` is recovered and echoed back.
  It is omitted when there is no id to recover — non-JSON, a non-object,
  a missing/empty/non-string `id`, or a binary frame.
- **`FRAME_TOO_LARGE`** — always id-less, by design. The frame is
  rejected on size before it is ever parsed; re-parsing an over-limit
  payload just to recover an id would reintroduce the cost the
  `maxFrameSize` gate exists to avoid.

Use the presence of an `error` frame (vs. a `result`) to distinguish
protocol-level issues (malformed frame, unknown frame type) from
command-level errors (handler threw, validation failed) — those come
back as `result`.

## Validation at the Edge

Inbound frames are shape-validated by `decodeFrame` before reaching
any handler. The validator rejects:

- Non-JSON or non-object payloads
- Missing or empty `id`
- Missing or unknown `type`
- Missing `cmd` on `cmd` frames
- Missing `channel` on `sub` / `unsub` / `pub` frames
- Missing `payload` field on `pub` frames (the value can be `null`,
  but the field must be present — distinguishes "publish nothing"
  from "I forgot a field")

Anything that fails → server sends a single `error` frame with code
`BAD_FORMAT`.

This is shape validation only; it does **not** validate command
payloads against schemas. That happens later, after the command is
matched, via the registered `Validator<T>`.

## Codec Functions

Both functions are exported for users who need to drive the protocol
manually (custom clients, replay tests, etc.):

```ts
import { decodeFrame, encodeFrame } from '@tundralibs/rpc';
import type { InboundFrame, OutboundFrame } from '@tundralibs/rpc';

// Server-side: encode an outbound frame to a string ready for ws.send()
const wire: string = encodeFrame({
  id: '1',
  type: 'result',
  ok: true,
  data: { id: 'u-1' },
});

// Client-side: parse and validate an inbound frame; null on malformed input
const frame: InboundFrame | null = decodeFrame(wire);
```

`encodeFrame` is just `JSON.stringify`. `decodeFrame` performs the
shape validation listed above.

## Error Codes

These codes are reserved by the protocol layer. Userland command
handlers and middleware can throw with any custom `.code` and that
will be sent back as the `error.code` of a `result` frame.

| Code              | Carrier  | Meaning                                                              |
| ----------------- | -------- | -------------------------------------------------------------------- |
| `BAD_FORMAT`      | `error`  | Invalid JSON, missing fields, unknown type                           |
| `FRAME_TOO_LARGE` | `error`  | Incoming frame exceeded the configured `maxFrameSize` (default 1 MB) |
| `UNKNOWN_COMMAND` | `result` | `cmd` frame referenced a command that wasn't registered              |
| `UNKNOWN_CHANNEL` | `result` | `sub` / `pub` frame referenced an unknown channel                    |
| `VALIDATION`      | `result` | The command's `Validator` threw                                      |
| `FORBIDDEN`       | `result` | Channel `authorize` returned `false`                                 |
| `AUTHZ_ERROR`     | `result` | Channel `authorize` itself threw                                     |
| `PUBLISH_REFUSED` | `result` | Client `pub` on a channel without `onPublish`                        |
| `NOT_SUBSCRIBED`  | `result` | Client `pub` on a channel it is not currently subscribed to          |
| `PUBLISH_ERROR`   | `result` | Channel `onPublish` handler threw                                    |
| `HANDLER_ERROR`   | `result` | Command handler threw without a custom `.code`                       |

An `unsub` for a channel the client never subscribed to (or one already
force-dropped server-side by an authorization revocation) is **not** an
error — the server replies with an `unsubscribed` ack regardless, so
unsubscribe is idempotent. Such a no-op `unsub` does **not** fire the
channel's `onUnsubscribe` hook: the hook fires exactly once per active
subscription actually removed, keeping it paired 1:1 with `onSubscribe`
(so presence counters and room-membership state stay balanced).

## Versioning

The wire protocol is part of `@tundralibs/rpc`'s public API. New
frame types or new fields on existing types may be added in minor
versions; existing fields will not change shape without a major
version bump. If you ever need to support multiple versions, use the
`upgrade` hook's `protocol` selection (see
[Compat-WebServer-WebSocket.md](../../compat/webserver/docs/Compat-WebServer-WebSocket.md))
to negotiate `tundra-channels-v1` vs `tundra-channels-v2`.

---

[← Back to RPC](../README.md)
