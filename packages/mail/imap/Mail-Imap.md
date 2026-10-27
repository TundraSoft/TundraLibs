# IMAP Client

`ImapClient` speaks the RFC 9051 / RFC 3501 subset a mailbox reader needs,
over `@tundralibs/compat`'s `connect()` and `upgradeTls()`.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

## Table of Contents

- [Features](#features)
- [Connecting](#connecting)
- [Deadlines and aborts](#deadlines-and-aborts)
- [API Reference](#api-reference)
- [Errors](#errors)
- [Wire details](#wire-details)
- [Related Documentation](#related-documentation)

## Features

| Feature                                                   | Deno | Bun | Node.js | Workers |
| --------------------------------------------------------- | ---- | --- | ------- | ------- |
| Implicit TLS (IMAPS, port 993)                            | ✅   | ✅  | ✅      | ✅      |
| STARTTLS on a plain connection                            | ✅   | ✅  | ✅      | ✅      |
| Private CA, client certificate, `servername` override     | ✅   | ✅  | ✅      | ❌      |
| LOGIN, AUTHENTICATE PLAIN                                 | ✅   | ✅  | ✅      | ✅      |
| LIST, CREATE, SELECT, EXAMINE, NOOP, LOGOUT               | ✅   | ✅  | ✅      | ✅      |
| UID SEARCH, UID FETCH, UID STORE, UID COPY                | ✅   | ✅  | ✅      | ✅      |
| UID MOVE with COPY / STORE / expunge fallback             | ✅   | ✅  | ✅      | ✅      |
| UID EXPUNGE (UIDPLUS) with plain EXPUNGE fallback         | ✅   | ✅  | ✅      | ✅      |
| Literals split across reads, bounded by `maxSize`         | ✅   | ✅  | ✅      | ✅      |
| Modified UTF-7 mailbox names                              | ✅   | ✅  | ✅      | ✅      |
| IDLE, pipelining, CONDSTORE, BODYSTRUCTURE, partial fetch | ❌   | ❌  | ❌      | ❌      |

The Workers column is compat's `cloudflare:sockets` path; this package's own
tests run on Deno, Bun and Node.

## Connecting

```ts
import { ImapClient } from '@tundralibs/mail/imap';

const client = new ImapClient({
  hostname: 'mail.example.com',
  // port: 993,             default for security 'tls'; 143 otherwise
  // security: 'tls',       'starttls' upgrades before any credential is sent
  auth: { user: 'help@example.com', pass: 'app-password' },
  // auth.method: 'LOGIN' | 'PLAIN'; omitted = LOGIN unless LOGINDISABLED
  timeout: 20_000, // per command, default 30_000
  // connectTimeout: 20_000, dial + greeting + STARTTLS + auth; default = timeout
  // signal: controller.signal,
  // maxSize: 16 * 1024 * 1024, largest literal buffered, default 16 MiB
  // tls: { ca: [pem], servername: 'mail.internal' },
});

await client.connect();
client.capabilities; // ReadonlySet, uppercased: 'MOVE', 'UIDPLUS', 'AUTH=PLAIN', …
client.has('move'); // case-insensitive
await client.logout();
```

`connect()` dials, reads the greeting, upgrades with STARTTLS when asked,
authenticates, and refreshes the capability list, all under
`connectTimeout`. A PREAUTH greeting skips authentication. With
`security: 'starttls'` the client fails rather than continue in the clear
when the server does not advertise STARTTLS. `security: 'none'` exists for
tests against a local fake.

## Deadlines and aborts

Each command runs under `timeout`, measured from the write to the tagged
reply. When it passes, or when `signal` aborts, the client closes the
socket before rejecting, since a half-read reply leaves the protocol state
unknown. The next call throws `ImapConnectionError` (`not connected`); make
a new client, or call `connect()` on the same one.

A job that must finish in 30 s sets `timeout` to what one command may take
and passes `AbortSignal.timeout(30_000)` as `signal`. The two compose: the
first to fire wins.

Only one command may be in flight. A second call while one is pending
throws `ImapConnectionError` (`another command is in flight`).

## API Reference

All methods reject with `ImapResponseError` on a tagged NO or BAD, and
with `ImapConnectionError`, `ImapTimeoutError` or `ImapParseError` as
described under [Errors](#errors). The `uids` argument is an `ImapUidSet`:
one number, a list (joined into ranges), or a raw sequence set string such
as `'1:*'`.

### list()

```ts ignore
list(reference?: string, pattern?: string): Promise<ImapMailbox[]>
```

LIST, defaulting to `""` and `"*"`. Names are decoded from modified UTF-7;
`attributes` keep the server's spelling (`\HasNoChildren`, `\Noselect`).

### create()

```ts ignore
create(name: string): Promise<void>
```

CREATE. A duplicate is a NO (`ALREADYEXISTS` on servers that say so); check
with `list()` first when the call must be idempotent.

### select() / examine()

```ts ignore
select(name: string, options?: { readOnly?: boolean }): Promise<ImapMailboxStatus>
examine(name: string): Promise<ImapMailboxStatus>
```

SELECT or EXAMINE. The result carries `exists`, `recent`, `unseen`,
`flags`, `permanentFlags`, `uidValidity`, `uidNext` and `readOnly`, and is
also available as `client.mailbox` until the next select. A failed SELECT
leaves no mailbox selected.

Store `uidValidity` next to any UID you keep: a UID is meaningful only
together with the UIDVALIDITY it was read under.

### search()

```ts ignore
search(criteria?: ImapSearchCriteria): Promise<number[]>
```

UID SEARCH; `{}` is ALL. Keys: `seen`, `flagged`, `answered`, `deleted`
(booleans, `false` sends the `UN` form), `since`, `before`, `on` (a `Date`,
sent as its UTC calendar day), `uid`, `from`, `to`, `subject`, and `raw` for
anything else, appended verbatim. Non-ASCII text goes out as a literal with
`CHARSET UTF-8`. Both `* SEARCH` and the IMAP4rev2 `* ESEARCH` reply are
read. UIDs come back ascending.

```ts
import { ImapClient } from '@tundralibs/mail/imap';

declare const client: ImapClient;
const weekAgo = new Date(Date.now() - 7 * 86_400_000);
const stale = await client.search({ before: weekAgo });
if (stale.length > 0) {
  await client.store(stale, ['\\Deleted']);
  await client.expunge(stale);
}
```

### fetch()

```ts ignore
fetch(uids: ImapUidSet, items: ImapFetchItem[], options?: ImapFetchOptions): Promise<ImapMessage[]>
```

UID FETCH. Items: `flags`, `internalDate`, `size` (RFC822.SIZE),
`envelope`, `body` (`BODY.PEEK[]`, the raw message), `header`
(`BODY.PEEK[HEADER]`). `uid` and `seq` are always set. Bodies are peeked,
so `\Seen` is untouched. A UID the server does not report (expunged
meanwhile) is simply absent.

A body or header longer than `maxSize` (`options.maxSize`, else the
client's) is read off the socket and discarded, the reply is consumed to
its end, and `ImapMessageTooLargeError` is thrown with the `uid` and the
announced `size`. The connection stays usable; fetch the header alone, or
pass a larger `maxSize`. Fetch one UID at a time when a single large
message must not fail the batch.

### store()

```ts ignore
store(uids: ImapUidSet, flags: string[], mode?: ImapFlagMode): Promise<void>
```

UID STORE with `.SILENT`. `mode` is `add` (default, `+FLAGS`), `remove`
(`-FLAGS`) or `set` (`FLAGS`). A flag with whitespace or list characters is
rejected before anything is sent.

### copy() / move()

```ts ignore
copy(uids: ImapUidSet, mailbox: string): Promise<void>
move(uids: ImapUidSet, mailbox: string): Promise<void>
```

`move()` sends UID MOVE (RFC 6851) when the `MOVE` capability is
advertised. Otherwise it sends UID COPY, UID STORE `+FLAGS.SILENT
(\Deleted)`, then `expunge(uids)`. The fallback is three commands: a
failure between them can leave the message in both mailboxes, or flagged
`\Deleted` in the source. A missing target is a NO with code `TRYCREATE`.

### expunge()

```ts ignore
expunge(uids?: ImapUidSet): Promise<number>
```

With `uids` and the `UIDPLUS` capability, UID EXPUNGE of those messages
only. Otherwise a plain EXPUNGE, which removes every `\Deleted` message in
the mailbox, including ones another session flagged. Returns the number of
`* n EXPUNGE` lines the server sent.

### noop(), logout(), close()

`noop()` is a keep-alive. `logout()` sends LOGOUT and closes; a server that
drops the connection after `* BYE` without the tagged OK is tolerated.
`close()` drops the socket without LOGOUT.

## Errors

Import from `@tundralibs/mail/errors`. All extend `MailError`.

| Error                      | `context`                           | Thrown by                                     |
| -------------------------- | ----------------------------------- | --------------------------------------------- |
| `ImapAuthError`            | `hostname`, `user`, `text`          | `connect()`                                   |
| `ImapResponseError`        | `command`, `status`, `text`, `code` | any command answered NO or BAD                |
| `ImapTimeoutError`         | `operation`, `timeoutMs`            | any command, `connect()`                      |
| `ImapConnectionError`      | `operation`, `reason`               | not connected, EOF, `* BYE`, abort, in flight |
| `ImapParseError`           | `reason`, `line`                    | a line the client cannot read                 |
| `ImapMessageTooLargeError` | `uid`, `size`, `maxSize`            | `fetch()`                                     |
| `MailError`                |                                     | an invalid UID set or flag, before sending    |

After `ImapResponseError` and `ImapMessageTooLargeError` the connection is
open and in sync. After every other `Imap*Error` it is closed.

```ts
import { ImapClient } from '@tundralibs/mail/imap';
import { ImapResponseError, ImapTimeoutError } from '@tundralibs/mail/errors';

declare const client: ImapClient;
try {
  await client.select('Processed');
} catch (e) {
  if (e instanceof ImapResponseError && e.context.code === 'NONEXISTENT') {
    await client.create('Processed');
    await client.select('Processed');
  } else if (e instanceof ImapTimeoutError) {
    // the socket is closed; reconnect or give up
    throw e;
  } else {
    throw e;
  }
}
```

## Wire details

- Strings go out as atoms when safe, quoted otherwise, and as `{n}`
  literals (after the server's `+`) when they hold CR, LF, NUL or
  non-ASCII, so any password works.
- Mailbox names are modified UTF-7 (RFC 3501 §5.1.3) in both directions;
  `encodeUtf7` and `decodeUtf7` are exported for callers that log or
  compare raw names.
- Dates in search keys are `DD-Mon-YYYY` from the `Date`'s UTC day.
  INTERNALDATE is parsed with its zone into a `Date`.
- Literals in replies are read exactly, binary-safe, however the bytes are
  split across socket reads; a literal beyond `maxSize` is drained.
- The client does not pass compat's `timeout` or `signal` to `connect()`:
  on Bun and Node those are handed to `net.connect`, which destroys the
  socket when they fire even after the connection is up. The deadline
  described above bounds the dial instead.

## Related Documentation

- [Mail-Mime](../mime/Mail-Mime.md) - Parse the bytes `fetch()` returns.
- [Compat-Net](../../compat/docs/Compat-Net.md) - The socket layer and
  its per-runtime TLS limits.

---

[← Back to Mail](../README.md)
