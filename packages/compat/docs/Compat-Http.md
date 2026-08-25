# Compat-Http

`@tundralibs/compat/http` — runtime-agnostic, pure HTTP building blocks shared by
server-side packages (webserver, radrouter, rpc, a framework layer) and
client-side ones (fetch wrappers, a REST client), so none re-implement them.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

> Every helper here is pure computation — no filesystem, socket, `process`, or
> other runtime global — so it runs **unchanged on all five targets**: Deno,
> Bun, Node.js, Cloudflare Workers, and the browser. Only `contentTypeFor` pulls
> a dependency (`@std/media-types`, itself a pure lookup table); the rest are
> self-contained. Nothing here can throw `UnsupportedRuntimeError`.

## Table of Contents

- [Installation](#installation)
- [Methods, status codes, status text](#methods-status-codes-status-text)
- [Content negotiation](#content-negotiation)
- [Range requests (RFC 7233)](#range-requests-rfc-7233)
- [Cookies (RFC 6265)](#cookies-rfc-6265)
- [Content-Type from a path](#content-type-from-a-path)
- [Related Documentation](#related-documentation)

## Installation

**Deno:**

```bash
deno add @tundralibs/compat
```

**Bun:**

```bash
bunx jsr add @tundralibs/compat
```

**Node.js:**

```bash
npx jsr add @tundralibs/compat
```

## Methods, status codes, status text

Three typed constants for building and reading responses:

- `HTTPMethod` — the nine RFC-defined methods: `GET`, `POST`, `PUT`, `DELETE`,
  `PATCH`, `HEAD`, `OPTIONS`, `TRACE`, `CONNECT`. Custom verbs are out of scope;
  widen the type at the call site if you need one.
- `StatusCode` — the codes application code actually emits, as a literal union
  that still accepts any `number` (the escape hatch), so IDE autocomplete lists
  the known codes without rejecting a custom `599`.
- `STATUS_TEXT` — the IANA reason phrase for a code, or `undefined` for a code
  not in the table.

```ts
import { STATUS_TEXT, type StatusCode } from '@tundralibs/compat/http';

// Build a Response, filling statusText from the code.
function reply(status: StatusCode, body: string): Response {
  return new Response(body, { status, statusText: STATUS_TEXT[status] ?? '' });
}

console.log(reply(404, 'nope').statusText); // "Not Found"
console.log(STATUS_TEXT[200]); // "OK"
```

> `STATUS_TEXT[code]` returns `undefined` for any code outside the IANA table —
> including a custom `599`, which `StatusCode` accepts at the type level but
> cannot supply a phrase for. Always guard with `?? ''` (or your own phrase)
> when the code may be arbitrary. Reach for these when your response layer needs
> a default reason phrase; skip them if you already write reason phrases by hand.

## Content negotiation

`negotiate(accept, offered)` picks the client's best match by q-value and
specificity — the most-specific `Accept` entry decides an offer's quality, and
ties resolve to the **earliest offered** (server preference). A
missing/blank/unparseable `Accept` yields the first offer (the server default);
`undefined` means the client accepts none of what you offer.

```ts
import { negotiate } from '@tundralibs/compat/http';

negotiate('text/html, application/json;q=0.9', [
  'application/json',
  'text/html',
]); // → 'text/html' (q=1 beats q=0.9)
negotiate('*/*', ['application/json', 'text/html']); // → 'application/json' (first offer)
negotiate('text/*', ['application/json', 'text/html']); // → 'text/html' (type/* matches)
negotiate(null, ['application/json', 'text/html']); // → 'application/json' (default)
negotiate('image/png', ['application/json']); // → undefined (no match)
```

A realistic handler — negotiate once, then branch on the winner:

```ts
import { negotiate } from '@tundralibs/compat/http';

function represent(req: Request): Response {
  const type = negotiate(req.headers.get('accept'), [
    'application/json',
    'text/html',
  ]);
  if (type === undefined) {
    return new Response('Not Acceptable', { status: 406 });
  }
  const body = type === 'text/html'
    ? '<p>hi</p>'
    : JSON.stringify({ hi: true });
  return new Response(body, { headers: { 'content-type': type } });
}

represent(new Request('https://x/', { headers: { accept: 'text/html' } }));
```

> An explicit `q=0` marks a type **unacceptable**: `negotiate('application/json;q=0', ['application/json'])`
> returns `undefined` even though it was offered. Offered values must be full
> `type/subtype` media types — an offer with no `/` scores zero and can never
> win. `negotiate` handles only the `Accept` header; language/encoding/charset
> negotiation is not covered.

## Range requests (RFC 7233)

`parseRange(header, size)` resolves a single `Range: bytes=…` header against a
known size and returns one of three things:

- an inclusive `{ start, end }` ([`ByteRange`](#range-requests-rfc-7233)) — answer `206 Partial Content`,
- `'unsatisfiable'` — answer `416` with `Content-Range: bytes */<size>`,
- `undefined` — no/invalid range, or a multi-range → serve the whole body.

```ts
import { parseRange } from '@tundralibs/compat/http';

parseRange('bytes=0-99', 500); // → { start: 0, end: 99 }
parseRange('bytes=100-', 500); // → { start: 100, end: 499 } (open-ended → EOF)
parseRange('bytes=-100', 500); // → { start: 400, end: 499 } (suffix: last 100)
parseRange('bytes=600-700', 500); // → 'unsatisfiable' (start past EOF)
parseRange('bytes=0-9,20-29', 500); // → undefined (multi-range → serve whole)
parseRange(null, 500); // → undefined
```

A `ByteRange` slots straight into `readFileStream(path, range)` from
`@tundralibs/compat/file`, so the three outcomes map cleanly onto a
file-serving handler:

```ts
import {
  contentTypeFor,
  parseRange,
  STATUS_TEXT,
} from '@tundralibs/compat/http';
import { readFileStream, stat } from '@tundralibs/compat/file';

async function serveFile(req: Request, path: string): Promise<Response> {
  const { size } = await stat(path);
  const type = contentTypeFor(path);
  const range = parseRange(req.headers.get('range'), size);

  if (range === 'unsatisfiable') {
    return new Response(STATUS_TEXT[416], {
      status: 416,
      headers: { 'content-range': `bytes */${size}` },
    });
  }
  if (range === undefined) {
    return new Response(await readFileStream(path), {
      headers: { 'content-type': type, 'accept-ranges': 'bytes' },
    });
  }
  return new Response(await readFileStream(path, range), {
    status: 206,
    headers: {
      'content-type': type,
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
      'content-length': String(range.end - range.start + 1),
    },
  });
}

serveFile(
  new Request('https://x/v.mp4', { headers: { range: 'bytes=0-1023' } }),
  '/srv/v.mp4',
);
```

> `parseRange` handles a **single** range only. A multi-range header, a
> syntactically invalid one, and a zero-length resource (`size === 0`) all
> return `undefined` — the caller serves the full body, which is a valid
> response. The `'unsatisfiable'` result is the only one that must become a
> `416`; don't treat `undefined` as an error. Bounds are inclusive, matching
> both `Content-Range` and `readFileStream`'s `{ start, end }`.

## Cookies (RFC 6265)

`parseCookies(header)` decodes a `Cookie` request header into a name → value map
(values percent-decoded, surrounding double-quotes stripped, malformed pairs
skipped — never thrown). `serializeCookie(name, value, options)` builds one
`Set-Cookie` value with the value percent-encoded, so it can never inject
`;`/CRLF into the header.

```ts
import {
  type CookieOptions,
  parseCookies,
  serializeCookie,
} from '@tundralibs/compat/http';

// On the way out — one Set-Cookie value per call.
const opts: CookieOptions = {
  maxAge: 3600, // seconds (floored); use `expires` for an absolute Date
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
};
const setCookie = serializeCookie('sid', 'a b/c', opts);
// → 'sid=a%20b%2Fc; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax'

// On the way in — decode the request's Cookie header (round-trips the value).
const jar = parseCookies(`${setCookie.split(';')[0]}; theme=dark`);
console.log(jar.sid, jar.theme); // 'a b/c' 'dark'
console.log(setCookie);
```

An illegal cookie name is a `TypeError`, not a skipped attribute:

```ts
import { serializeCookie } from '@tundralibs/compat/http';

try {
  serializeCookie('bad name', 'x'); // a space is illegal in a cookie name
} catch (err) {
  console.log(err instanceof TypeError); // true
}
```

> `serializeCookie` throws `TypeError` on a name containing separators or control
> chars (space, `;`, `=`, `(`, …) — the **value** is always safe (percent-encoded),
> but validating the name is on you. Set at most one of `maxAge` (seconds) or
> `expires` (a `Date`). Browsers ignore `SameSite: 'None'` unless `Secure` is
> also set, and `serializeCookie` will not add `Secure` for you. Signing and
> verification are a higher layer — these helpers do not authenticate cookies.

## Content-Type from a path

`contentTypeFor(pathOrName)` resolves a file's `Content-Type` from its extension
(via `@std/media-types`, with a charset appended for text types). It never reads
the file — resolution is by extension string only. Any file-serving webserver
needs this to set a correct response type.

```ts
import { contentTypeFor } from '@tundralibs/compat/http';

contentTypeFor('/public/index.html'); // → 'text/html; charset=UTF-8'
contentTypeFor('data.json'); // → 'application/json; charset=UTF-8'
contentTypeFor('logo.svg'); // → 'image/svg+xml' (no charset — not a text type)
contentTypeFor('firmware.xyz'); // → 'application/octet-stream' (unknown extension)
contentTypeFor('.env'); // → 'application/octet-stream' (dotfile — no extension)
contentTypeFor('README'); // → 'application/octet-stream' (no extension)
```

> An unknown extension, an extension-less name, and a dotfile (`.env`) all fall
> back to `application/octet-stream` — a safe, download-forcing default, never a
> throw. A charset (`; charset=UTF-8`) is appended only for text types. Both `/`
> and `\` count as path separators, so a Windows-style path resolves correctly.
> Because it matches on the extension alone, a mislabelled file (`.png` holding
> JSON) gets the extension's type, not the content's.

## Related Documentation

- [Compat-File](Compat-File.md) — `readFileStream` / `stat`, the file-serving
  side of the range example above.
- [Compat-Fetch](Compat-Fetch.md) — the HTTP client these primitives support.

---

[← Back to Compat](../README.md)
