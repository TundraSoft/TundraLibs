# Mail roadmap

What `@tundralibs/mail` does not do yet, and the decisions behind the
current shape. The package layout reserves subpaths for the planned
modules so they slot in without moving anything.

## Planned

- **SMTP client** (`@tundralibs/mail/smtp`): submission on 587 with
  STARTTLS and on 465 with implicit TLS, AUTH PLAIN and LOGIN, over the
  same compat sockets and the same deadline model as the IMAP client.
- **MIME builder** (`@tundralibs/mail/mime`): compose a message with text,
  HTML, attachments and threading headers, for the SMTP client and for
  vendor APIs that take raw MIME.
- **IDLE** and **NOOP-based polling helpers** for long-running readers.
- **XOAUTH2 / OAUTHBEARER** for mailbox hosts that refuse passwords.
- **Partial and structured fetch** (`BODY[]<offset.count>`, BODYSTRUCTURE,
  single sections) so a large attachment can be skipped or streamed instead
  of failing the whole message against `maxSize`.

## Deferred by design

- **One command in flight.** Pipelining would complicate error recovery
  for no gain in a scheduled job that reads a handful of messages.
- **Whole-message fetch bounded by `maxSize`**, instead of a streaming
  `AsyncIterable`. The consumer stores whole messages; streaming moves the
  size problem to the caller without removing it.
- **Plain EXPUNGE as the last `move()` fallback** when neither MOVE nor
  UIDPLUS is advertised. It expunges every `\Deleted` message in the
  mailbox; the alternative, leaving the message flagged, loses it more
  quietly.
- **compat's connect `timeout` and `signal` are not used** for the dial.
  The client's own deadline covers dial, greeting, STARTTLS and auth under
  one clock, and a late socket is closed when it arrives. Through compat
  2.8.0 those options also destroyed an established socket on Bun and
  Node, so passing them would need a compat floor above that.
