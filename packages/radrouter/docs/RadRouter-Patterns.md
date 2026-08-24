# Patterns

The four pattern kinds RadRouter recognises at registration. All are
parsed at insert time; no regex runs at lookup.

## Table of Contents

- [Why delimited names](#why-delimited-names)
- [Named parameter — `:name:`](#1-named-parameter--name)
- [Parameter with literal suffix — `:name:<literal>`](#2-parameter-with-literal-suffix--nameliteral)
- [Greedy suffix — `:name:-*`](#3-greedy-suffix--name-)
- [Greedy prefix — `*-:name:`](#4-greedy-prefix---name)
- [Percent-decoding of captured values](#percent-decoding-of-captured-values)
- [Matching priority](#matching-priority)
- [The captured-parameter object](#the-captured-parameter-object)

## Why delimited names

Variable segments use a delimited form: a parameter name is wrapped in
colons (`:name:`) rather than the more familiar `:name` prefix-only
shape. The trailing colon **terminates** the name — which is what
unlocks unambiguous one-pass parsing of suffix-anchored params like
`:name:.gz`. In Express/Fastify's `:name.gz` form, the parser has to
guess where the name ends and the literal anchor begins (is the name
`name`, `name.`, `name.g`, `name.gz`?). Delimited names sidestep that:
everything between the two colons is the name; everything after the
closing colon (within the segment) is a literal anchor.

## 1. Named parameter — `:name:`

Consumes exactly **one** path segment (between two `/` characters) and
binds it to `params[name]`.

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const handler = async () => {};

router.get('/users/:userId:', [handler]);
// /users/42        → match, { userId: '42' }
// /users/42/posts  → no match (extra segment)
// /users           → no match (missing segment)
// /users/          → no match (empty capture)
```

Multiple named params per path are fine — each binds independently:

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const handler = async () => {};

router.get('/tenants/:tenantId:/users/:userId:', [handler]);
// /tenants/acme/users/42 → { tenantId: 'acme', userId: '42' }
```

## 2. Parameter with literal suffix — `:name:<literal>`

A single-segment capture anchored by a required literal at the end of
the segment. Useful for routing by file extension, MIME-shape, or any
suffix-discriminated resource. The captured value is everything in the
segment **before** the literal.

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const tarGzHandler = async () => {};
const gzHandler = async () => {};
const defaultHandler = async () => {};

router.get('/files/:name:.tar.gz', [tarGzHandler]);
router.get('/files/:name:.gz', [gzHandler]);
router.get('/files/:name:', [defaultHandler]);

// /files/backup.tar.gz → tarGzHandler, { name: 'backup' }
// /files/log.gz        → gzHandler,    { name: 'log' }
// /files/notes.txt     → defaultHandler, { name: 'notes.txt' }
// /files/.gz           → no match (empty capture is rejected)
```

**Longest suffix wins.** When several `:name:<literal>` siblings share
the same parent node, they are tried longest-suffix-first so the most
specific pattern matches before a shorter overlap. A plain `:name:`
sibling is only tried after all suffix variants have failed.

The literal can be any string that does not contain `/` (it lives
inside one segment), e.g. `.json`, `-edit`, `_v2`, `.tar.bz2`.

## 3. Greedy suffix — `:name:-*`

Consumes the parameter segment **plus all remaining segments**, joined
by `/`. It must be the last segment in the path — a greedy suffix
followed by further segments throws `MalformedPathError` at
registration (it would otherwise register a route no lookup can reach).
Use it for file-tree mounts, static asset paths, or catch-alls.

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const handler = async () => {};

router.get('/files/:path:-*', [handler]);
// /files/readme.md           → { path: 'readme.md' }
// /files/docs/api/intro.md   → { path: 'docs/api/intro.md' }
// /files                     → no match (greedy requires ≥1 segment)
```

> **Capture shape — validate before any filesystem use.** The value is
> the raw remainder of the request path after the mount, percent-decoded
> once. Lookup is deliberately **non-normalising** (see
> [Routing → Slash handling](./RadRouter-Routing.md)), so the capture is
> _not_ guaranteed to be a clean, relative path. It **can**:
>
> - **start with `/`** — a doubled slash after the mount:
>   `/files//docs` → `{ path: '/docs' }`;
> - **end with `/`** — a trailing slash (lookup strips only _one_, and
>   none under `ignoreTrailingSlash: false`): `/files/a//` →
>   `{ path: 'a/' }`;
> - **contain `//`** — interior doubled slashes are preserved;
> - **decode to an absolute path** — a percent-encoded slash is decoded:
>   `/files/%2Fetc%2Fpasswd` → `{ path: '/etc/passwd' }` (and `%2e%2e`
>   decodes to `..`).
>
> If you resolve the capture against a base directory — e.g.
> `path.resolve(root, params.path)` — an absolute or `..`-bearing value
> escapes `root`. The router is ctx-agnostic and touches no filesystem;
> **rejecting a leading `/`, absolute paths, and `..` segments is the
> consumer's responsibility.**

## 4. Greedy prefix — `*-:name:`

The mirror image of greedy suffix: the parameter binds to a **tail
portion** of the path, with `*-` representing "anything (possibly
across segments) leading up to a `-` separator." The named portion
is what gets bound; the `*-` portion is discarded.

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const handler = async () => {};

// Pattern: /api/*-:version:/data
router.get('/api/*-:version:/data', [handler]);
// /api/release-v1/data         → { version: 'v1' }
// /api/beta-v2/data            → { version: 'v2' }
// /api/v1/data                 → no match ("-" separator missing)
```

### URL-greedy: `*` may span slashes

The `*` is **URL-greedy**, mirroring `:name:-*` on the suffix side
— it consumes any characters from its position onward, including
`/`. The `:name:` then captures the single segment that follows the
final separator dash before the next static anchor:

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const handler = async () => {};

router.get('/api/*-:version:/data', [handler]);
// /api/release/2024-01-snapshot/data → { version: 'snapshot' }
// /api/foo/bar-baz/data              → { version: 'baz' }
```

### Multi-dash: rightmost dash wins

When several `-` candidates appear, the lookup tries the **rightmost
dash** first (greedy). If that placement fails the rest of the
pattern (e.g. the static anchor after `:name:` doesn't seat), it
backtracks to earlier dashes. This lets a pattern cope with dashes
inside both the `:name:` value and the captured tail:

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const handler = async () => {};

router.get('/api/*-:version:/data', [handler]);
// /api/foo-bar-baz/data → { version: 'baz' }  (rightmost dash)
```

The `-` is the canonical separator shown above; the literal can be
any non-`/` character.

## Percent-decoding of captured values

Every captured value — from `:name:`, `:name:<literal>`, and both
greedy forms alike — is run through `decodeURIComponent` exactly once
before it reaches `match.params`. This applies uniformly, not just to
the greedy-suffix case called out above:

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/search/:term:', []);
router.get('/files/:name:.txt', []);

router.find('GET', '/search/caf%C3%A9')?.params.term; // 'café'
router.find('GET', '/files/a%2Fb.txt')?.params.name; // 'a/b'
```

> **A malformed percent-escape is a miss, not a throw.** A stray `%`
> or an incomplete escape (e.g. `%zz`) makes `decodeURIComponent` throw
> internally; RadRouter catches that per-branch and treats it as a
> non-match rather than propagating a `URIError` to the caller.
> `router.find()` **never throws** on a malformed request path — a
> request nobody can satisfy just resolves to `undefined`, the same
> `undefined` as any other miss.

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/users/:id:', []);

router.find('GET', '/users/%'); // undefined — not a thrown URIError
```

## Matching priority

At every node, lookup tries children in this order, falling back only
on miss:

1. **Static label** (exact byte/char match)
2. **`:name:<literal>` children** — longest suffix first
3. **`:name:` child** (plain param)
4. **Greedy** (`:name:-*` or `*-:name:`)

This means a static `/users/me` always wins over `/users/:userId:`,
and `/files/:name:.tar.gz` always wins over `/files/:name:.gz` which
always wins over `/files/:name:`. The ordering is a property of the
trie, not a per-request scan — registrations are sorted on insert.

## The captured-parameter object

Every match returns its captures in `match.params`. Because a param name
may be any `[A-Za-z_]\w*` identifier — including `Object.prototype`
member names like `constructor`, `hasOwnProperty`, or `__proto__` — the
bag is a **null-prototype object** (`Object.create(null)`), not a plain
`{}`. A null prototype keeps every capture a plain own string entry
instead of shadowing a builtin or vanishing into the `__proto__` setter.

The consequence is that `params` inherits **no** `Object.prototype`
methods. Read it as data, never via inherited helpers:

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/users/:id:', []);

const { params } = router.find('GET', '/users/42')!;

params.id; // ✅ '42'
'id' in params; // ✅ true
Object.keys(params); // ✅ ['id']
JSON.stringify(params); // ✅ '{"id":"42"}'
Object.prototype.hasOwnProperty.call(params, 'id'); // ✅ true

params.hasOwnProperty('id'); // ❌ TypeError: not a function
params.toString(); // ❌ TypeError: not a function
String(params); // ❌ TypeError: cannot convert to primitive
`${params}`; // ❌ TypeError: cannot convert to primitive
```

---

[← Back to RadRouter](../README.md)
