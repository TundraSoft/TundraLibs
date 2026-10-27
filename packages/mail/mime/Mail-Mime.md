# MIME Parser

`parseMessage()` turns raw RFC 5322 bytes into a `MailMessage`: decoded
headers, the MIME part tree, and a flattened view of text, HTML and
attachments. It is synchronous, pure, and never throws on malformed input.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [Quick Start](#quick-start)
- [What is decoded](#what-is-decoded)
- [Bodies and attachments](#bodies-and-attachments)
- [Charsets](#charsets)
- [Tolerance](#tolerance)
- [Helpers](#helpers)
- [Related Documentation](#related-documentation)

## Quick Start

```ts
import { parseMessage } from '@tundralibs/mail/mime';

declare const raw: Uint8Array; // e.g. ImapMessage.body
const message = parseMessage(raw);

message.subject; // 'Café order – receipt'
message.from; // [{ name: 'Ada Lövelace', address: 'ada@example.com' }]
message.messageId; // 'm1@example.com'
message.references; // ['m-1@example.com', 'm0@example.com']
message.date; // Date | undefined
message.text; // first text/plain body, as sent
message.html; // first text/html body, as sent; never render it unsanitised
for (const a of message.attachments) {
  a.filename; // 'résumé.pdf' (RFC 2231 decoded)
  a.contentType; // 'application/pdf'
  a.disposition; // 'attachment' | 'inline'
  a.contentId; // for cid: references from the HTML
  a.content; // Uint8Array, transfer-decoded
}
if (message.autoSubmitted || message.precedence === 'bulk' || message.listId) {
  // an auto-reply, a bounce or list mail: do not answer it
}
```

## What is decoded

| Field                                  | Source headers                      | Notes                                                                 |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `headers`                              | all                                 | Unfolded, RFC 2047 decoded, original names and order                  |
| `subject`                              | Subject                             | Encoded words decoded, adjacent words joined without the whitespace   |
| `from`, `to`, `cc`, `bcc`, `replyTo`   | the address headers                 | Groups flattened, `addr (Name)` comments become names                 |
| `sender`                               | Sender                              | First mailbox                                                         |
| `date`                                 | Date                                | RFC 5322 incl. obsolete zones and two-digit years; `undefined` if not |
| `messageId`, `inReplyTo`, `references` | Message-ID, In-Reply-To, References | Angle brackets removed; bare ids accepted                             |
| `autoSubmitted`, `precedence`          | Auto-Submitted, Precedence          | Lowercased                                                            |
| `listId`, `xAutoreply`                 | List-Id, X-Autoreply                | As sent                                                               |
| `text`, `html`, `attachments`          | the part tree                       | See below                                                             |
| `root`                                 | the whole message                   | The `MailPart` tree                                                   |

Every `MailPart` carries its own `headers`, `contentType` (type, subtype,
params, all lowercased keys), `encoding`, `disposition`, `filename`,
`contentId`, `charset`, the transfer-decoded `content`, `text` for `text/*`
parts, `children` for multiparts, and `message` for a `message/rfc822`
part, which is parsed recursively.

## Bodies and attachments

The tree is walked depth first. A leaf is a **body** when it is `text/*`
(or a multipart with no usable boundary, read as text), has no `filename`,
and is not `Content-Disposition: attachment`. The first `text/plain` body
becomes `text` and the first `text/html` body becomes `html`; a second
body of the same kind, as in a `multipart/mixed` with two text parts, is
appended with a newline. Every other leaf, and every `message/rfc822`
part, is an attachment. An attachment is `inline` when its disposition says
so, or when it has a `Content-ID` and no `attachment` disposition.

Transfer encodings: `base64` (whitespace and stray bytes skipped, URL-safe
alphabet accepted), `quoted-printable` (soft breaks, protected trailing
whitespace, a lone `=` kept), and identity for `7bit`, `8bit`, `binary` and
anything unknown.

## Charsets

A `text/*` part is decoded with the runtime's `TextDecoder` under its
declared `charset`. A label the runtime does not know, or no label at all,
falls back to strict UTF-8 and then to Latin-1, so a string always comes
back. The declared label is kept in `part.charset` for callers that want
to know. Header blocks follow the same chain: UTF-8 when valid, Latin-1
otherwise, then RFC 2047 words decode under their own charsets.

Which labels `TextDecoder` knows differs by runtime; UTF-8, UTF-16 and the
ISO-8859 / Windows families are safe everywhere.

## Tolerance

Real mail is malformed often enough that the parser degrades instead of
throwing:

| Input                                 | Result                                      |
| ------------------------------------- | ------------------------------------------- |
| LF-only line endings                  | Parsed as CRLF                              |
| Header line with no colon             | Dropped                                     |
| Continuation line with nothing before | Dropped                                     |
| Bare 8-bit text in a header           | Decoded as UTF-8, else Latin-1              |
| Unterminated or misspelt encoded word | Left as written                             |
| Unparseable `Date`                    | `date` is `undefined`                       |
| `<addr` with no closing `>`           | Address taken to the end                    |
| Multipart with no boundary            | Body read as plain text                     |
| Missing closing boundary              | Last part runs to the end                   |
| No blank line after the headers       | Whole input is headers; `text` is empty     |
| `Content-Transfer-Encoding: base64;`  | Parameters and junk after `;` ignored       |
| Unknown charset                       | Latin-1 fallback                            |
| Empty input                           | Empty message: empty lists, `text` is empty |

## Helpers

The pieces the parser is built from are exported for callers working with
headers on their own, for example an IMAP `ENVELOPE` or a webhook payload.

| Function                          | Does                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `parseRawHeaders(bytes)`          | Header block to `{ name, value }[]`, unfolded, not RFC 2047 decoded                     |
| `getHeader(headers, name)`        | First value, case-insensitive; `getHeaders` for all                                     |
| `decodeEncodedWords(text)`        | RFC 2047 `=?charset?B/Q?…?=` words                                                      |
| `parseAddressList(text)`          | Address header to `MailAddress[]`                                                       |
| `parseMessageIds(text)`           | `<id>` list to `string[]`                                                               |
| `parseDate(text)`                 | RFC 5322 date to `Date`, or `undefined`                                                 |
| `parseParameterized(text)`        | `value; key=val` with RFC 2231 continuations and charsets                               |
| `parseContentType(text)`          | `MailContentType`, defaulting to `text/plain`                                           |
| `decodeTransfer(bytes, encoding)` | Apply a Content-Transfer-Encoding; `decodeBase64`, `decodeQuotedPrintable` individually |
| `decodeText(bytes, charset?)`     | The charset fallback chain                                                              |

```ts
import { decodeEncodedWords, parseAddressList } from '@tundralibs/mail/mime';

decodeEncodedWords('=?UTF-8?Q?Caf=C3=A9?= =?UTF-8?Q?_order?='); // 'Café order'
parseAddressList('Team: a@example.com, "Bee, B" <b@example.com>;');
// [{ address: 'a@example.com' }, { name: 'Bee, B', address: 'b@example.com' }]
```

## Related Documentation

- [Mail-Imap](../imap/Mail-Imap.md) - Fetch the bytes this parses.

---

[← Back to Mail](../README.md)
