# Compat — HTTP protocol primitives

`@tundralibs/compat/http` — runtime-agnostic, dependency-free, pure HTTP
building blocks shared by server-side packages (webserver, radrouter, rpc, a
framework layer) and client-side ones (fetch wrappers, a REST client), so none
re-implement them.

## Methods, status codes, status text

```ts
import {
  type HTTPMethod,
  STATUS_TEXT,
  type StatusCode,
} from '@tundralibs/compat/http';

const method: HTTPMethod = 'GET';
const status: StatusCode = 404;
console.log(STATUS_TEXT[status]); // "Not Found"
```

## Content negotiation

`negotiate(accept, offered)` picks the client's best match by q-value and
specificity (most-specific `Accept` entry wins; ties go to the earliest
offered = server preference). A missing/blank/unparseable `Accept` yields the
first offer; `undefined` means the client accepts none.

```ts
import { negotiate } from '@tundralibs/compat/http';

negotiate('text/html, application/json;q=0.9', [
  'application/json',
  'text/html',
]);
// → 'text/html'
negotiate(null, ['application/json', 'text/html']); // → 'application/json' (default)
negotiate('image/png', ['application/json']); // → undefined
```

## Range requests (RFC 7233)

`parseRange(header, size)` resolves a single `Range: bytes=…` header against a
known size: an inclusive `{ start, end }`, `'unsatisfiable'` (answer `416`), or
`undefined` (no/invalid range, or multi-range → serve the whole body). Pairs
with `readFileStream(path, range)` from `@tundralibs/compat/file`.

```ts
import { parseRange } from '@tundralibs/compat/http';

parseRange('bytes=0-99', 500); // → { start: 0, end: 99 }
parseRange('bytes=-100', 500); // → { start: 400, end: 499 } (last 100)
parseRange('bytes=600-700', 500); // → 'unsatisfiable'
parseRange(null, 500); // → undefined
```

## Cookies (RFC 6265)

`parseCookies(header)` decodes a `Cookie` request header into a name→value map
(malformed pairs skipped). `serializeCookie(name, value, options)` builds one
`Set-Cookie` value (value percent-encoded, so it can't inject `;`/CRLF) and
throws `TypeError` on an illegal cookie name. Signing is a higher-layer concern
and is not included here.

```ts
import {
  type CookieOptions,
  parseCookies,
  serializeCookie,
} from '@tundralibs/compat/http';

parseCookies('sid=abc; theme=dark'); // → { sid: 'abc', theme: 'dark' }

const opts: CookieOptions = {
  maxAge: 3600,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
};
serializeCookie('sid', 'abc', opts);
// → 'sid=abc; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax'
```

## Content-Type from a path

`contentTypeFor(pathOrName)` resolves a file's `Content-Type` by extension (via
`@std/media-types`, charset included for text types). An unknown/absent
extension or a dotfile falls back to `application/octet-stream`. Any
file-serving webserver needs this.

```ts
import { contentTypeFor } from '@tundralibs/compat/http';

contentTypeFor('/public/index.html'); // → 'text/html; charset=UTF-8'
contentTypeFor('data.json'); // → 'application/json; charset=UTF-8'
contentTypeFor('archive.bin'); // → 'application/octet-stream'
```
