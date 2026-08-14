# Schema definition

Everything NORM needs to know about your data lives in one place: the
`Column.*` builders, the `Entity()` constructor, and the `Schema()` /
`use()` composition functions. From that single declaration NORM
derives your types, validation, migrations, and at-rest encryption —
no codegen, no decorators, no import cycles. This guide is the full
builder reference: every column factory and modifier, every entity
kind and option, foreign keys and derived relations, and how schemas
compose.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Column builders](#column-builders)
  - [Factories](#factories)
  - [Common modifiers](#common-modifiers)
  - [Validators](#validators)
  - [Defaults](#defaults)
  - [Transforms](#transforms)
  - [Encryption and hashing](#encryption-and-hashing)
  - [Digest columns](#digest-columns)
  - [Masked columns](#masked-columns)
  - [Correct by construction](#correct-by-construction)
- [Defining entities](#defining-entities)
  - [TABLE](#table)
  - [VIEW](#view)
  - [QUERY](#query)
  - [Options reference](#options-reference)
  - [Hooks](#hooks)
  - [Write scoping (insert / update pick-lists)](#write-scoping-insert--update-pick-lists)
- [Foreign keys and relations](#foreign-keys-and-relations)
  - [`model` is a registry key](#model-is-a-registry-key)
  - [Reverse relations](#reverse-relations)
  - [Eager projection](#eager-projection)
  - [Referential actions](#referential-actions)
  - [Many-to-many through a view](#many-to-many-through-a-view)
- [Hash siblings](#hash-siblings)
- [Schemas and composition](#schemas-and-composition)
- [Related documentation](#related-documentation)

## Overview

A definition is three layers, inside-out:

```typescript
import { Column, Entity, Schema, use } from '@tundralibs/norm';

// 1. Columns — immutable, chainable builders.
const email = Column.varchar(255).encrypt().hash();

// 2. Entities — a name, a column map, and an options bag.
const Users = Entity('users', { id: Column.uuid(), email /* … */ }, {
  pk: ['id'],
});

// 3. Schemas — a named collection of entities, composed with use().
const Identity = Schema('Identity', { Users });
const registry = use(Identity);
```

Builders are **immutable**: every chained call returns a _new_ builder,
and the chain's result is carried on `.spec` as plain, serializable
data (this is what snapshots and migrations diff). The TypeScript value
type rides along as a phantom generic, so `RowOf`, `InsertOf`, and
`UpdateOf` are read straight off the builder type — no `as const`
discipline, no literal-widening pitfalls.

Invalid combinations don't type-check. `hash()` exists only after
`encrypt()`; the string validators disappear once you encrypt; a
digest column has no `encrypt()`. The classic "runtime throws because
you called two incompatible options" is mostly a compile error here
instead — see [Correct by construction](#correct-by-construction).

## Column builders

Start every column with a factory from the `Column` object, then chain
modifiers. Import it from the package root:

```typescript
import { Column } from '@tundralibs/norm';
```

### Factories

| Factory                            | SQL type       | TS value     | Notes                                                                                                                            |
| ---------------------------------- | -------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Column.varchar(length)`           | `VARCHAR(n)`   | `string`     | String validators apply.                                                                                                         |
| `Column.char(length)`              | `CHAR(n)`      | `string`     | Fixed-width string.                                                                                                              |
| `Column.text()`                    | `TEXT`         | `string`     | Unbounded string.                                                                                                                |
| `Column.clob()`                    | `CLOB`         | `string`     | Character large object (`TEXT`/`LONGTEXT`/`TEXT`). String validators apply.                                                      |
| `Column.xml()`                     | `XML`          | `string`     | Native `XML` on Postgres, `TEXT` elsewhere.                                                                                      |
| `Column.uuid()`                    | `UUID`         | `string`     | Pair with `.default({ $$_expression: 'UUID' })`.                                                                                 |
| `Column.integer()`                 | `INTEGER`      | `number`     | Numeric validators apply.                                                                                                        |
| `Column.int()`                     | `INT`          | `number`     | Dialect synonym of `integer`.                                                                                                    |
| `Column.tinyint()`                 | `TINYINT`      | `number`     | 1-byte int (→ `SMALLINT`/`INTEGER` where absent).                                                                                |
| `Column.smallint()`                | `SMALLINT`     | `number`     | 2-byte int.                                                                                                                      |
| `Column.bigint()`                  | `BIGINT`       | `bigint`     | Values ride as `bigint` (`0n`).                                                                                                  |
| `Column.decimal(precision, scale)` | `DECIMAL(p,s)` | `number`     | Fixed-point.                                                                                                                     |
| `Column.numeric(precision, scale)` | `NUMERIC(p,s)` | `number`     | Exact fixed-point; synonym of `decimal`.                                                                                         |
| `Column.float()`                   | `FLOAT`        | `number`     |                                                                                                                                  |
| `Column.double()`                  | `DOUBLE`       | `number`     |                                                                                                                                  |
| `Column.real()`                    | `REAL`         | `number`     |                                                                                                                                  |
| `Column.bit()`                     | `BIT`          | `number`     | Bit value (`BIT`/`BIT`/`INTEGER`).                                                                                               |
| `Column.boolean()`                 | `BOOLEAN`      | `boolean`    | No numeric/string validators.                                                                                                    |
| `Column.date()`                    | `DATE`         | `Date`       | Date validators apply.                                                                                                           |
| `Column.time()`                    | `TIME`         | `Date`       | Only the clock part is significant.                                                                                              |
| `Column.datetime()`                | `DATETIME`     | `Date`       | For engines that distinguish it from `TIMESTAMP` (MariaDB).                                                                      |
| `Column.timestamp()`               | `TIMESTAMP`    | `Date`       | Wall-clock, no zone.                                                                                                             |
| `Column.timestamptz()`             | `TIMESTAMPTZ`  | `Date`       | Timestamp WITH time zone — `TIMESTAMPTZ` on Postgres, tz-aware `TIMESTAMP` on MariaDB, ISO-with-offset `TEXT` on SQLite.         |
| `Column.json<Shape>()`             | `JSONB`        | `Shape`      | Typed object. Renders as **`JSONB`** on Postgres (never bare `JSON`), native `JSON` on MariaDB, `TEXT` on SQLite.                |
| `Column.blob()`                    | `BLOB`         | `Uint8Array` | Raw bytes. The crypto codec is text-canonical, so binary can't be meaningfully encrypted — encrypt an encoded text form instead. |
| `Column.binary(length)`            | `BINARY(n)`    | `Uint8Array` | Fixed-length raw bytes (`BYTEA`/`BINARY`/`BLOB`). Like `blob`, not encryptable.                                                  |
| `Column.varbinary(length)`         | `VARBINARY(n)` | `Uint8Array` | Variable-length raw bytes. Like `blob`, not encryptable.                                                                         |
| `Column.hash(algorithm?)`          | `VARCHAR`      | `string`     | One-way [digest column](#digest-columns). Default `'SHA-256'`.                                                                   |
| `Column.password(algorithm?)`      | `VARCHAR`      | `string`     | Auth digest: `SHA-*` (deterministic, filterable) or `'PBKDF2'` (salted, verify-based). See [Digest columns](#digest-columns).    |
| `Column.mask(source, fn)`          | _(virtual)_    | `string`     | Computed-on-read [mask](#masked-columns); never stored.                                                                          |

`json` / `boolean` / `blob` / `binary` / `varbinary` / `bit` are the
_base_ builder — they carry
the [common modifiers](#common-modifiers) and `encrypt()`, but none of
the value validators (there is nothing to range-check on a boolean).

### Common modifiers

These chain on every builder kind (a few are overridden on
[masks](#masked-columns)):

| Modifier                | Effect                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `.nullable()`           | Column accepts `NULL`; also makes it omittable on insert. Adds `\| null` to the TS type.                                          |
| `.default(v)`           | Insert default — see [Defaults](#defaults).                                                                                       |
| `.defaultOnUpdate(v)`   | Auto-touch on every update (e.g. `updatedAt`).                                                                                    |
| `.comment(text)`        | Documentation + DDL comment (`COMMENT ON COLUMN …`).                                                                              |
| `.hidden()`             | Exclude from default projections. `ReadRowOf` drops it, but it stays explicitly projectable and stays writable.                   |
| `.unfilterable()`       | Reject the column in `WHERE` / `ORDER BY`.                                                                                        |
| `.renamedFrom(oldName)` | Migration hint: emit `RENAME COLUMN` instead of a data-losing drop+add. Inert everywhere else; delete it once applied everywhere. |
| `.beforeWrite(fn)`      | [Transform](#transforms) before validate/encrypt/write.                                                                           |
| `.afterRead(fn)`        | [Transform](#transforms) on the way back out.                                                                                     |
| `.encrypt()`            | [Encrypt at rest](#encryption-and-hashing).                                                                                       |

```typescript
import { Column } from '@tundralibs/norm';

// hidden + unfilterable: readable only when explicitly asked for,
// never a filter or sort target.
const passwordHash = Column.varchar(64).hidden().unfilterable();
```

### Validators

Validators emit plain constraint data on the spec and are enforced by
the generated [Guardian](../../guardian/README.md) before any SQL runs.
Which validators exist depends on the builder kind:

| Builder kind | Factories                                                                                       | Validators                                                   |
| ------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| String       | `varchar` `char` `text` `clob` `uuid` `xml`                                                     | `.minLength(n)` `.maxLength(n)` `.pattern(re)` `.lov([...])` |
| Number       | `integer` `int` `tinyint` `smallint` `bigint` `decimal` `numeric` `float` `double` `real` `bit` | `.min(v)` `.max(v)` `.lov([...])`                            |
| Date         | `date` `time` `datetime` `timestamp` `timestamptz`                                              | `.min(date)` `.max(date)`                                    |

`.lov([...])` does double duty: it constrains the value to the given
literals **and narrows the TS type to their union** — no `as const`
needed.

```typescript
import { Column } from '@tundralibs/norm';

const role = Column.varchar(12)
  .lov(['admin', 'editor', 'viewer']) // TS type is now 'admin' | 'editor' | 'viewer'
  .default('viewer');

const slug = Column.varchar(32)
  .pattern(/^[a-z0-9-]+$/)
  .beforeWrite((v) => v.trim().toLowerCase());

const clicks = Column.bigint().min(0n).default(0n);
```

`.pattern()` accepts a `RegExp` or a string; it is stored serializably
as `{ source, flags }`. `.min()` / `.max()` on bigint and date columns
canonicalize the bound to a string in the spec (the runtime rehydrates
per column type).

### Defaults

`.default(v)` fires when the insert payload **omits** the column (or
passes explicit `undefined`); an explicit `null` is validated as a
value, not replaced. It also makes the column omittable in `InsertOf`.
`.defaultOnUpdate(v)` does the same on every update. Both accept three
forms:

```typescript
import { Column } from '@tundralibs/norm';

// 1. Literal — used as-is.
const isActive = Column.boolean().default(true);

// 2. Local generator — a plain JS function, called per row by the
//    generated Guardian (great for timestamps / ULIDs client-side).
const createdAt = Column.timestamp().default(() => new Date());

// 3. DB-side expression — evaluated by the database.
const id = Column.uuid().default({ $$_expression: 'UUID' });

// defaultOnUpdate auto-touches on every write:
const updatedAt = Column.timestamp()
  .default(() => new Date())
  .defaultOnUpdate(() => new Date());
```

An `ExpressionDefault` is `{ $$_expression: string, args?: unknown }`;
it is passed through to the query untouched and never validated as a JS
value.

### Transforms

`.beforeWrite(fn)` normalizes a value before it is validated,
encrypted, and written; `.afterRead(fn)` transforms it as it comes back
from a read. Both are runtime-only callbacks — they are stripped from
the JSON/snapshot export.

```typescript
import { Column } from '@tundralibs/norm';

const email = Column.varchar(255)
  .pattern(/^\S+@\S+\.\S+$/)
  .beforeWrite((v) => v.trim().toLowerCase()); // case-insensitive at rest

const country = Column.char(2).beforeWrite((v) => v.toUpperCase());
```

### Encryption and hashing

`.encrypt()` encrypts the column at rest (AES via the Norm secret) and
is available on **every** value kind — string, number, bigint, date,
boolean, json. The logical TS type is unchanged (an encrypted
`timestamp()` still reads and writes `Date`); the runtime canonicalizes
the plaintext to a string before encrypting and decodes it back on
read, and the physical column becomes `TEXT`.

```typescript
import { Column } from '@tundralibs/norm';

// Date in TS, ciphertext TEXT at rest.
const birthday = Column.timestamp().encrypt().nullable();
```

Two consequences follow from encryption:

1. **Validators must chain before `encrypt()`** — they constrain the
   _plaintext_, so `encrypt()` narrows the builder to a surface where
   they no longer exist.
2. **Encrypted columns are not filterable** — random-IV ciphertext
   never matches an equality predicate. To filter or enforce
   uniqueness by plaintext, add `.hash()`:

```typescript
import { Column } from '@tundralibs/norm';

// Ciphertext at rest, still filterable / uniquable by plaintext.
const email = Column.varchar(255).encrypt().hash();
```

`.hash()` exists _only_ on an encrypted builder and synthesizes a
deterministic `<col>_hash` sibling column — see
[Hash siblings](#hash-siblings). Full details on the crypto pipeline,
digests, and override hooks live in
[Security](NORM-Security.md).

### Digest columns

`Column.hash(algorithm)` is a **standalone one-way digest** column —
for values like passwords that must be comparable but never readable.
Callers write and filter by plaintext; the runtime digests on the way
in and stores only the hex digest, whose `VARCHAR` length derives from
the algorithm.

```typescript
import { Column } from '@tundralibs/norm';

// Store a password digest, never the plaintext.
const pin = Column.hash('SHA-256').nullable();
```

`algorithm` is one of `'SHA-256'` (default, `VARCHAR(64)`), `'SHA-384'`
(`VARCHAR(96)`), or `'SHA-512'` (`VARCHAR(128)`). String validators
(`pattern` / `minLength` / `maxLength`) chain here and constrain the
_plaintext_ (password policy). `encrypt()` is a hard error — a digest
is already one-way.

> A digest column is the inverse of `.encrypt().hash()`: a digest is
> write-and-forget (you can never read the value back), whereas an
> encrypted+hashed column is fully readable with an _additional_
> lookup digest on the side.

`Column.password(algorithm?)` is the auth-facing digest column. It has
two modes — **you decide**:

| Mode                                                             | Behaviour                                                                                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Column.password('SHA-256' \| 'SHA-384' \| 'SHA-512')` (default) | **Deterministic** digest, identical to `hash()` — write and **filter by plaintext**, store the digest. Fast & searchable, but a leaked table is brute-forceable.                 |
| `Column.password('PBKDF2')`                                      | **Salted** PBKDF2 hash — the correct choice for real passwords. Each hash is unique, so the column is **not filterable**: read the row and `pbkdf2Verify(candidate, row.field)`. |

```typescript
import { Column, Entity, Norm, pbkdf2Verify, Schema } from '@tundralibs/norm';

const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  secret: Column.password('PBKDF2').minLength(12), // salted, verify-based
}, { pk: ['id'] });

declare const userId: string;
declare const candidatePassword: string;
const db = new Norm({ database: { dialect: 'sqlite', path: './data' } })
  .use(Schema('Identity', { Users }));

// Log in: look the user up by a filterable column, then verify.
const row = (await db.repo('Users').find({ '@id': userId })).data[0];
const ok = row && await pbkdf2Verify(candidatePassword, row.secret);
```

`pbkdf2Verify` is re-exported from `@tundralibs/norm`; the PBKDF2 KDF
(salt, OWASP-guided iterations) comes from `@tundralibs/crypt` and is
overridable via the instance's `crypto.pbkdf2Hash`.

> **Why not a plain digest for passwords?** A fast SHA-2 digest is cheap
> to brute-force if the table leaks. `'PBKDF2'` salts + stretches the
> input so each hash is unique and slow to attack — at the cost of
> plaintext filtering (verify instead of look up).

### Masked columns

`Column.mask(source, fn)` is a **virtual** column computed client-side
from a sibling `source` column after decrypt/`afterRead`. It is never
stored, never in DDL or snapshots, and excluded from writes, filters,
and ordering.

```typescript
import { Column } from '@tundralibs/norm';

const Users = {
  apiKey: Column.varchar(256).encrypt(), // readable, never lookupable
  apiKeyHint: Column.mask('apiKey', (v) => `…${v.slice(-4)}`),
};
```

The mask has its own first-class key (the property name), several masks
may share one source, and the source's own `.hidden()` decision is
independent of the mask. Type the `fn` parameter to the source's
_logical_ type when it isn't a string — e.g.
`Column.mask<Date>('birthday', (v) => v.getFullYear().toString())`.

Only `.nullable()`, `.hidden()`, and `.comment()` chain on a mask.
`.default()`, `.defaultOnUpdate()`, `.beforeWrite()`, `.afterRead()`,
and `.encrypt()` all throw — a mask is presentation, computed from its
source, with nothing to write or encrypt. Declare `.nullable()` when
the _source_ is nullable (a null source yields a null mask).

### Correct by construction

The illegal combinations of a literal API are simply not reachable
here — most are compile errors, a few are guarded runtime throws:

| Attempt                                                     | Result                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `.hash()` before `.encrypt()`                               | Compile error — `hash()` exists only on the encrypted builder. |
| A validator after `.encrypt()`                              | Compile error — validators live on the plaintext builders.     |
| `.encrypt().encrypt()`                                      | Runtime throw — already encrypted.                             |
| `Column.hash(algo).encrypt()`                               | Runtime throw — digests are one-way.                           |
| `.default()` / `.beforeWrite()` / `.encrypt()` on a `mask`  | Runtime throw — masks are computed presentation.               |
| A `_hash`-named column colliding with a synthesized sibling | Runtime throw at `Entity()` — norm owns `<column>_hash` names. |

## Defining entities

```typescript ignore
Entity(name, columns, options);
```

The options bag carries a `type` discriminator that selects the kind.
Omit it for the default, `TABLE`.

### TABLE

Physical, writable, DDL-emitting. `pk` is **required** (composite keys
just list several columns). `fk` aliases drive joins and reverse
relations; `index` and `unique` emit DDL indexes.

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).pattern(/^\S+@\S+\.\S+$/)
    .beforeWrite((v) => v.trim().toLowerCase())
    .encrypt().hash()
    .comment('Sign-in identifier; encrypted at rest, unique via sibling'),
  apiKey: Column.varchar(256).encrypt(),
  apiKeyHint: Column.mask('apiKey', (v) => `…${v.slice(-4)}`),
  role: Column.varchar(12).lov(['admin', 'editor', 'viewer']).default('viewer'),
  displayName: Column.varchar(120).minLength(2),
  passwordHash: Column.varchar(64).hidden().unfilterable(),
  pin: Column.hash('SHA-256').nullable(),
  loginCount: Column.integer().min(0).default(0),
  createdAt: Column.timestamp().default(() => new Date()),
  updatedAt: Column.timestamp().default(() => new Date())
    .defaultOnUpdate(() => new Date()),
}, {
  pk: ['id'],
  comment: 'Registered accounts',
  unique: { email: ['email_hash'] }, // uniqueness on the digest sibling
  update: ['displayName', 'role', 'loginCount', 'passwordHash'],
  hooks: {
    beforeInsert: (row) => ({ ...row, displayName: row.displayName.trim() }),
  },
});
```

A composite primary key is just a longer tuple:

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const PostTags = Entity('post_tags', {
  postId: Column.integer(),
  tagId: Column.integer(),
}, {
  pk: ['postId', 'tagId'], // composite
  fk: {
    Post: { model: 'Posts', on: { postId: 'id' }, reverseAs: 'TagLinks' },
    Tag: { model: 'Tags', on: { tagId: 'id' }, reverseAs: 'PostLinks' },
  },
});
```

### VIEW

Read-only and DB-side (`CREATE VIEW … AS query`). A view **can** be
joined against and **can** be the base of further stored queries. Pass
a `query` (an OQL `SELECT`), optionally `materialized: true`, and
optionally a _logical_ `fk` (join linkage only — never DDL, never
snapshotted; see [Many-to-many through a view](#many-to-many-through-a-view)).

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const ActiveLinks = Entity('active_links', {
  id: Column.integer(),
  slug: Column.varchar(32),
  targetUrl: Column.text(),
  clicks: Column.bigint(),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'links',
    columns: ['id', 'slug', 'targetUrl', 'clicks', 'isActive'],
    projection: {
      '@id': true,
      '@slug': true,
      '@targetUrl': true,
      '@clicks': true,
    },
    where: { '@isActive': true },
  },
});
```

Views have no primary key, so a derived reverse relation is **always**
`hasMany`; declare `reverseCardinality: 'hasOne'` explicitly when the
view is one-row-per-target. `materialized: true` emits
`CREATE MATERIALIZED VIEW` on Postgres and degrades to a plain view on
other dialects.

### QUERY

A read-only, client-side stored `SELECT` (no DDL). It is **terminal**:
it cannot be joined and cannot be built upon by other views or queries,
and it cannot declare foreign keys.

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const TopLinks = Entity('top_links', {
  slug: Column.varchar(32),
  clicks: Column.bigint(),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'active_links', // composes on the VIEW above
    columns: ['slug', 'clicks'],
    projection: { '@slug': true, '@clicks': true },
    orderBy: { '@clicks': 'DESC' },
  },
});
```

### Options reference

| Option            | Kind        | Description                                                                                                                        |
| ----------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | all         | `'TABLE'` (default), `'VIEW'`, or `'QUERY'`.                                                                                       |
| `pk`              | TABLE       | **Required.** Primary-key column tuple; composite keys list several.                                                               |
| `fk`              | TABLE, VIEW | Named FK aliases → target + column mapping. See [Foreign keys](#foreign-keys-and-relations).                                       |
| `index`           | TABLE       | Named indexes: name → column tuple. Synthesized `<col>_hash` siblings are indexable.                                               |
| `unique`          | TABLE       | Named `UNIQUE` constraints, emitted as unique indexes (diffable on every dialect).                                                 |
| `insert`          | TABLE       | Insert [pick-list](#write-scoping-insert--update-pick-lists).                                                                      |
| `update`          | TABLE       | Update [pick-list](#write-scoping-insert--update-pick-lists).                                                                      |
| `hooks`           | all         | Whole-row [hooks](#hooks). TABLEs get the write + delete hooks; read-only kinds get `afterRead` only.                              |
| `dbSchema`        | TABLE, VIEW | Database namespace (e.g. Postgres `public`). Named `dbSchema` because "schema" already means a named entity collection in norm.    |
| `comment`         | all         | Documentation + DDL comment (`COMMENT ON TABLE …`).                                                                                |
| `defaultPageSize` | all         | Rows a limit-less `find()` fetches (default `10`). `0` = UNBOUNDED, and every such read emits a `warning` event.                   |
| `query`           | VIEW, QUERY | **Required** on read-only kinds. The stored OQL `SELECT`.                                                                          |
| `materialized`    | VIEW        | `CREATE MATERIALIZED VIEW` (Postgres; degrades elsewhere).                                                                         |
| `renamedFrom`     | TABLE       | Migration hint: this table's previous physical name (optionally `'dbSchema.name'`-qualified). Consumed only by the migration diff. |

### Hooks

Row-level hooks complement the per-column transforms — they see the
whole row (or, for deletes, the filter). Returning a row replaces the
payload; returning nothing means the hook mutated in place. Like column
transforms, hooks are runtime-only and drop out of the JSON export.

TABLE entities take four hooks:

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const Tickets = Entity('tickets', {
  id: Column.integer(),
  subject: Column.varchar(200),
  deletedAt: Column.timestamp().nullable(),
}, {
  pk: ['id'],
  hooks: {
    beforeInsert: (row) => ({ ...row, subject: row.subject.trim() }),
    beforeUpdate: (row) => row,
    afterRead: (row) => row,
    // Fires BEFORE a DELETE runs, with the caller's filter (undefined =
    // the all-rows form). THROW to veto — audit gates, soft-delete
    // enforcement. Runs for delete()/deleteByPK(), not truncate().
    beforeDelete: (filter) => {
      if (filter === undefined) throw new Error('refusing unfiltered delete');
    },
  },
});
```

Read-only kinds (VIEW, QUERY) take `afterRead` only — write-side hooks
(`beforeInsert` / `beforeUpdate`) are rejected at construction.

### Write scoping (insert / update pick-lists)

`insert` and `update` restrict which columns a **caller** may pass per
operation (the "request schema" pattern). Columns outside a declared
scope become norm-owned for that operation, and `InsertOf` / `UpdateOf`
plus the generated Guardians are limited to the scope. Omit a list and
every column is passable.

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const Accounts = Entity('accounts', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).encrypt().hash(),
  displayName: Column.varchar(120),
  role: Column.varchar(12).lov(['admin', 'user']).default('user'),
  updatedAt: Column.timestamp().defaultOnUpdate(() => new Date()),
}, {
  pk: ['id'],
  // email/id are immutable for callers; updatedAt auto-touches from
  // OUTSIDE the caller scope (norm-maintained behavior is unaffected).
  update: ['displayName', 'role'],
});
```

Scoping governs the payload surface, not norm itself: norm-maintained
behavior — hash siblings, `defaultOnUpdate` auto-touch — always runs
regardless of the pick-lists.

## Foreign keys and relations

A foreign key is a named alias mapping local columns to a target's
columns. Declared on `fk`, each one drives joins **and** a derived
reverse relation on the target.

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const Profiles = Entity('profiles', {
  userId: Column.uuid(),
  bio: Column.text().nullable(),
  birthday: Column.timestamp().encrypt().nullable(),
}, {
  pk: ['userId'],
  fk: {
    User: {
      model: 'Users', // registry key of the target — not a table name
      on: { userId: 'id' }, // local column → target column
      reverseAs: 'Profile', // Users rows can project '@Profile'
      reverseProject: true, // …and get it eagerly on default reads
      onDelete: 'CASCADE', // a profile can't outlive its user
    },
  },
});
```

### `model` is a registry key

`model` is the target's **entity key** — the stable name it is exposed
under in the schema registry (`Schema('Identity', { Users })` →
`'Users'`) — **not** its database table name. Renaming the physical
table, or moving it to another `dbSchema`, is an `ALTER`; no FK
declaration anywhere changes. There are no model imports and no import
cycles, and definitions serialize cleanly. Keys resolve — with named
errors — when schemas compose in [`use()`](#schemas-and-composition),
so a cross-schema FK (`Posts → 'Users'`) is written exactly like an
in-schema one.

### Reverse relations

Every FK from `A → B` automatically gives `B` a reverse relation.

- **`reverseAs`** names it. It defaults to `A`'s registry key, and
  auto-qualifies as `<Key>_via_<alias>` when two FKs share the same
  source and target. When two FKs point at the same target, name both
  reverses explicitly:

  ```typescript
  import { Column, Entity } from '@tundralibs/norm';

  export const Links = Entity('links', {
    id: Column.integer(),
    ownerId: Column.uuid(),
    createdById: Column.uuid(),
  }, {
    pk: ['id'],
    fk: {
      Owner: { model: 'Users', on: { ownerId: 'id' }, reverseAs: 'Links' },
      CreatedBy: {
        model: 'Users',
        on: { createdById: 'id' },
        reverseAs: 'CreatedLinks',
      },
    },
  });
  ```

- **`reverseCardinality`** (`'hasOne'` | `'hasMany'`) sets whether the
  target sees one row or many. It defaults by derivation: `hasOne` when
  the FK's local columns equal _this_ entity's primary key, else
  `hasMany`. In `Profiles` above the FK column (`userId`) is the whole
  pk, so `Users` sees `@Profile` as an object-or-null with no explicit
  cardinality needed. (Views have no pk, so their reverses are always
  `hasMany` unless you declare otherwise.)

A reverse name must be free on the target: it cannot collide with one of
the target's columns, with a foreign-key alias (those resolve first, so
the reverse would be unreachable), or with another reverse. Composing
with [`use()`](#schemas-and-composition) checks this once the full graph
is known and throws a `REVERSE_COLLISION` error naming the clash — set an
explicit `reverseAs` to resolve it.

### Eager projection

By default, relations are fetched only when you project them. Two flags
make a relation load eagerly on _default_ (projection-less) reads:

- **`project: true`** eager-fetches this relation on **this** entity's
  default reads — rows gain the alias as `object | null` (the target's
  local default row, depth-1, no transitive eager).
- **`reverseProject: true`** eager-fetches the derived reverse on the
  **target's** default reads. Only `hasOne` reverses qualify (explicit
  `reverseCardinality: 'hasOne'` or FK-columns-equal-pk); eager to-many
  lists on every innocent read would be a footgun, so `hasMany` is
  rejected at construction.

Explicit projections replace the eager default entirely, and write
`RETURNING` stays flat (it cannot join).

### Referential actions

`onDelete` and `onUpdate` take the cross-dialect-safe subset
`CASCADE | RESTRICT | NO_ACTION | SET_NULL`, applied to the physical FK
constraint. Omitting them uses the database default (`RESTRICT`). They
are **TABLE-only** — a VIEW's `fk` is a logical join with no physical
constraint to act on, so an action there is rejected at construction.

### Many-to-many through a view

The logical `fk` on a VIEW is what makes a view _projectable from its
target_ — the M2M pattern. A junction⋈far VIEW flattens the join once,
DB-side, and its logical FK derives the reverse relation on the target,
so "posts with their tags" is one call and one `SELECT` with no
junction pivoting:

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const TagsOfPosts = Entity('tags_of_posts', {
  postId: Column.integer(),
  tagId: Column.integer(),
  name: Column.varchar(40),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'post_tags',
    columns: ['postId', 'tagId'],
    joins: {
      T: {
        table: 'tags',
        columns: ['id', 'name'],
        type: 'INNER',
        on: { '@T.@id': '@tagId' },
      },
    },
    projection: { '@postId': true, '@tagId': true, '@T.@name': 'name' },
  },
  fk: {
    // Logical join fk only — never DDL. Gives Posts a '@Tags' relation.
    Post: { model: 'Posts', on: { postId: 'id' }, reverseAs: 'Tags' },
  },
});

// Posts now project their tags in one query:
//   db.repo('Posts').find(undefined, {
//     project: { '@title': true, '@Tags': { '@name': true } },
//   });
```

## Hash siblings

Chaining `.encrypt().hash()` tells `Entity()` to synthesize a
`<col>_hash` sibling column alongside the encrypted one. The sibling is
a deterministic SHA-256 digest (`VARCHAR(64)`), maintained by norm on
every write, so plaintext equality filters, `$in`, uniqueness, and
upsert conflict keys all rewrite transparently to an indexed digest
lookup.

You never declare the sibling — you _reference_ it by name in `index`
and `unique`:

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).encrypt().hash(),
}, {
  pk: ['id'],
  unique: { email: ['email_hash'] }, // uniqueness on the synthesized sibling
});
```

The sibling is norm-owned (`disableInsert` / `disableUpdate`), its
nullability follows the source column, and it follows the source
through `renamedFrom` so a rename doesn't drop every stored digest.
Declaring your own column named `<col>_hash` that collides with a
synthesized sibling is an error at `Entity()`. For the crypto pipeline,
digest algorithms, masks, and override hooks, see
[Security](NORM-Security.md).

## Schemas and composition

A **schema** is a named collection of entities — the database namespace
is the separate `dbSchema` option on `Entity()`. Group entities with
`Schema(name, entities)`, then compose any number of schemas into one
typed registry with `use(...schemas)`.

```typescript ignore
import { Schema, use } from '@tundralibs/norm';
import { Users } from './identity/users.ts';
import { Profiles } from './identity/profiles.ts';
import { Posts } from './blog/posts.ts';

const Identity = Schema('Identity', { Users, Profiles });
const Blog = Schema('Blog', { Posts }); // Posts' fk targets 'Users' cross-schema

// Compose exactly the schemas an instance exposes.
const registry = use(Identity, Blog);
```

`Schema()` accepts a plain object **or** a namespace/barrel import —
non-entity exports (helpers, constants) are filtered out, so
`Schema('Blog', BlogModule)` works directly. It validates everything it
can see and _defers_ unknown FK targets, because a target may live in
another schema.

`use()` merges the schemas into the flat registry a Norm instance is
constructed over, and this is where deferred names resolve. Composition
fails loudly with named errors when:

- Registry keys collide across composed schemas (keys must be unique).
- A deferred FK target doesn't resolve (e.g. composing `Blog` without
  `Identity`, so `'Users'` is missing).
- An FK target resolves to a `QUERY` — FK targets must be a `TABLE` or
  `VIEW`.
- A stored `SELECT` (of a VIEW or QUERY) reads from or joins a
  registered `QUERY`'s database name — queries are terminal.
- A [reverse-relation name](#reverse-relations) — derived or explicit
  `reverseAs` — collides with a column, a foreign-key alias, or another
  reverse on the target. Resolving reverses needs the full graph, so
  `use()` is the first place this is caught (it otherwise surfaces only
  when a Norm instance is constructed); `Schema()`, which may still be
  missing cross-schema targets, skips it.

Once composed, the registry is what you hand to the Norm handle to open
repos over your entities (see the [Norm README](../README.md) quick
start and [Querying](NORM-Querying.md)).

## Related documentation

- [Querying](NORM-Querying.md) — filters, typed projections, relations,
  aggregates, and pagination.
- [Security](NORM-Security.md) — encryption, digest siblings, masks,
  and crypto override hooks.
- [Migrations](NORM-Migrations.md) — snapshots, plans, the rebuild
  engine, and `renamedFrom` hints.
- [Scoping](NORM-Scoping.md) — tenant scoping and default filters.

---

[← Back to NORM](../README.md)
</content>
</invoke>
