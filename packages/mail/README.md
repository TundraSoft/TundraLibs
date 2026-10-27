# Mail

Cross-runtime IMAP client and MIME parser for Deno, Bun, Node.js and Cloudflare
Workers: read a mailbox over TLS (RFC 9051 / RFC 3501), parse raw messages
(RFC 5322, RFC 2045-2049, RFC 2047, RFC 2231) into headers, text, HTML and
attachments. Built on [compat](https://github.com/TundraSoft/TundraLibs/wiki/compat)'s
sockets, so one code path serves every runtime.

[![JSR](https://jsr.io/badges/@tundralibs/mail)](https://jsr.io/@tundralibs/mail)
[![JSR Score](https://jsr.io/badges/@tundralibs/mail/score)](https://jsr.io/@tundralibs/mail)
![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

## Overview

| Module      | Import                    | Does                                                                                         | Documentation                                                               |
| ----------- | ------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| IMAP client | `@tundralibs/mail/imap`   | LOGIN / AUTHENTICATE PLAIN, LIST, CREATE, SELECT, UID SEARCH / FETCH / STORE / MOVE, EXPUNGE | [Mail-Imap](https://github.com/TundraSoft/TundraLibs/wiki/Mail-Imap)        |
| MIME parser | `@tundralibs/mail/mime`   | Raw bytes to subject, addresses, ids, date, text, html, attachments, the auto-reply signals  | [Mail-Mime](https://github.com/TundraSoft/TundraLibs/wiki/Mail-Mime)        |
| Types       | `@tundralibs/mail/types`  | Every exported type                                                                          |                                                                             |
| Errors      | `@tundralibs/mail/errors` | `MailError` and the `Imap*Error` classes                                                     | [Mail-Imap](https://github.com/TundraSoft/TundraLibs/wiki/Mail-Imap#errors) |

The root `@tundralibs/mail` re-exports all four.

| Runtime            | IMAP                                                           | MIME |
| ------------------ | -------------------------------------------------------------- | ---- |
| Deno, Bun, Node.js | ✅                                                             | ✅   |
| Cloudflare Workers | ✅ over `cloudflare:sockets`, with compat's limits (see below) | ✅   |
| Browser            | ❌ `connect()` throws compat's `UnsupportedRuntimeError`       | ✅   |

On Workers, compat dials through `cloudflare:sockets`: implicit TLS and
STARTTLS both work, `tls.servername` must equal `hostname`, and a private CA
or client certificate is refused. The test suite runs on Deno, Bun and Node;
the Workers path is compat's and is not exercised here.

## Installation

**Deno:**

```bash
deno add @tundralibs/mail
```

**Bun:**

```bash
bunx jsr add @tundralibs/mail
```

**Node.js:**

```bash
npx jsr add @tundralibs/mail
```

## Quick Start

Read what is new in INBOX, parse each message, move it out. The whole run is
bounded: every command has a 20 s deadline, the job as a whole 60 s, and a
message larger than 16 MiB is fetched as header only.

```ts
import { ImapClient } from '@tundralibs/mail/imap';
import { parseMessage } from '@tundralibs/mail/mime';
import { ImapMessageTooLargeError } from '@tundralibs/mail/errors';

const client = new ImapClient({
  hostname: 'mail.example.com',
  auth: { user: 'help@example.com', pass: 'app-password' },
  timeout: 20_000,
  signal: AbortSignal.timeout(60_000),
  maxSize: 16 * 1024 * 1024,
});

const fetchRaw = async (uid: number) => {
  try {
    return (await client.fetch(uid, ['body']))[0]?.body;
  } catch (e) {
    if (!(e instanceof ImapMessageTooLargeError)) throw e;
    return (await client.fetch(uid, ['header']))[0]?.header;
  }
};

await client.connect();
const inbox = await client.select('INBOX');
for (const uid of await client.search({ seen: false })) {
  const raw = await fetchRaw(uid);
  if (!raw) continue; // expunged by another session meanwhile
  const message = parseMessage(raw);
  console.log(
    inbox.uidValidity,
    uid,
    message.subject,
    message.from[0]?.address,
  );
  await client.move(uid, 'Processed');
}
await client.logout();
```

`move()` uses UID MOVE when the server advertises it and falls back to COPY,
STORE `\Deleted` and expunge otherwise. `fetch()` peeks, so reading a message
does not mark it `\Seen`.

## Errors

Every error extends `MailError` (itself a `BaseError` from
[utils](https://github.com/TundraSoft/TundraLibs/wiki/Utils-BaseError)), with the
details in `error.context`.

| Error                      | When                                                                  | Connection after |
| -------------------------- | --------------------------------------------------------------------- | ---------------- |
| `ImapAuthError`            | Credentials refused, or LOGIN disabled with no PLAIN offered          | closed           |
| `ImapResponseError`        | A command answered NO or BAD (`status`, `text`, `code`)               | open             |
| `ImapTimeoutError`         | `timeout` / `connectTimeout` passed (`operation`, `timeoutMs`)        | closed           |
| `ImapConnectionError`      | Not connected, socket closed, `* BYE`, or `signal` aborted            | closed           |
| `ImapParseError`           | A server line outside the grammar the client reads                    | closed           |
| `ImapMessageTooLargeError` | A fetched body or header exceeds `maxSize` (`uid`, `size`, `maxSize`) | open             |

## Limits

- One command at a time per client; no pipelining and no IDLE. Poll with
  `search()` instead.
- `fetch()` returns whole messages, bounded by `maxSize`; there is no
  streaming fetch and no BODYSTRUCTURE or partial fetch.
- No SMTP yet, and no MIME builder. Both are planned, see the
  [roadmap](https://github.com/TundraSoft/TundraLibs/blob/main/packages/mail/ROADMAP.md).

## License

MIT
