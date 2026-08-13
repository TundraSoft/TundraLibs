# Routing semantics

Beyond pattern matching, RadRouter takes opinions on three other axes:
versioning, casing, and slash normalisation.

## Table of Contents

- [Versioned endpoints](#versioned-endpoints)
- [Case sensitivity](#case-sensitivity)
- [Slash handling](#slash-handling)

## Versioned endpoints

Three-tier fallback at every leaf: **exact requested version >
configured `defaultVersion` > unversioned slot**.

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
const getUsersV1 = async () => {};
const getUsersV2 = async () => {};

router.get('/api/users', [getUsersV1], 'v1');
router.get('/api/users', [getUsersV2], 'v2');

router.find('GET', '/api/users', 'v2'); // → v2 handler
router.find('GET', '/api/users'); // → unversioned (or defaultVersion)
```

Set a default version at construction so unversioned lookups land on a
chosen revision:

```ts
import { RadRouter } from '@tundralibs/radrouter';

type AppMw = (ctx: unknown, next: () => Promise<void>) => Promise<void>;

const router = new RadRouter<AppMw>({ defaultVersion: 'v2' });
router.find('GET', '/api/users'); // → v2 handler
router.find('GET', '/api/users', 'v1'); // → v1 handler (exact win)
```

Versions are arbitrary strings — `'v1'`, `'2024-03-01'`, anything that
matches your API evolution scheme. RadRouter only compares them for
equality.

## Case sensitivity

Case-sensitive by default — per RFC 3986 (paths are case-sensitive)
and the convention of Express / Fastify / Koa. Opt out for forgiving
matching (e.g. human-typed URLs, legacy migrations):

```ts
import { RadRouter } from '@tundralibs/radrouter';

type AppMw = (ctx: unknown, next: () => Promise<void>) => Promise<void>;
const handler: AppMw = async () => {};

const router = new RadRouter<AppMw>({ caseSensitive: false });
router.get('/Users/Profile', [handler]);
router.find('GET', '/users/profile'); // matches
router.find('GET', '/USERS/PROFILE'); // matches
```

There's a small per-lookup throughput cost for the case-insensitive
path; the default is the fast path. Measured: ~26% throughput drop on
the same workload (see [Performance](RadRouter-Performance.md)).

Folding covers ASCII **and** non-ASCII uppercase whose lowercase stays a
single UTF-16 unit (`Ü` ↔ `ü`, `É` ↔ `é`, and — via `String.prototype
.toLowerCase()` — capital sharp S `ẞ` U+1E9E ↔ `ß` U+00DF). The fold is
deliberately **length-preserving**, so the rare code points whose
lowercase _expands_ to more than one UTF-16 unit (e.g. `İ` U+0130 →
`i̇`, one unit becoming two) are left as-is and matched case-sensitively.
This keeps the folded lookup view aligned with the original-case URL used
to slice parameter values — the alternative would silently corrupt
captures that follow an expanding fold.

### Param values preserve the request's original case

Case folding applies only to **static path segments** for matching
purposes — captured parameter values come back with the request's
original case:

```ts
import { RadRouter } from '@tundralibs/radrouter';

type AppMw = (ctx: unknown, next: () => Promise<void>) => Promise<void>;
const handler: AppMw = async () => {};

const router = new RadRouter<AppMw>({ caseSensitive: false });
router.get('/users/:userId:', [handler]);

router.find('GET', '/Users/AbCdEf');
// matches, params.userId === 'AbCdEf'   ← case preserved
```

This way you can keep case-sensitive identifiers (mixed-case
usernames, base32-encoded tokens, etc.) inside a forgiving path
scheme without losing information in transit.

## Slash handling

Registration is **lenient** (`/api//users` normalises to
`/api/users`); lookup is **strict** (a request for `/api//users` does
NOT match a route registered as `/api/users`). This catches typo'd
registrations early while keeping lookups predictable.

| Stage        | Behaviour | Example                                              |
| ------------ | --------- | ---------------------------------------------------- |
| Registration | Lenient   | `/api//users`, `/api/users/` all become `/api/users` |
| Lookup       | Strict    | Request `/api//users` does NOT match `/api/users`    |

If you need lookups to forgive doubled slashes too, normalise the path
before calling `router.find()`. The router itself stays strict so
ambiguous registrations can't slip through.

---

[← Back to RadRouter](../README.md)
