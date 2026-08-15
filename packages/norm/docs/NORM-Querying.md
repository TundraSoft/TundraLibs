# Querying

Read and write data with NORM's typed repositories: filters, typed
projections, relations, aggregates, and pagination. Every method on a
repository resolves off your entity declaration, so column names,
operators, projection shapes, and return types are all checked at
compile time — typos are TypeScript errors, not runtime surprises.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Setup](#setup)
- [The result envelope](#the-result-envelope)
- [Reading: find, findOne, getByPK, count](#reading-find-findone-getbypk-count)
- [Filters](#filters)
- [Projections](#projections)
- [Relations](#relations)
- [Aggregates](#aggregates)
- [Pagination and totals](#pagination-and-totals)
- [Writes](#writes)
- [Escape hatches](#escape-hatches)
- [Related documentation](#related-documentation)

## Setup

Every example below operates on a composed database handle `db`. You
obtain one by opening an engine, constructing a `Norm`, and composing
one or more schemas with `use`:

```typescript ignore
import { Norm } from '@tundralibs/norm';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { Identity, Shortener } from './models/mod.ts';

const engine = new SQLiteEngine('shortly', { path: './data' });
const norm = new Norm({ engine, secret: process.env.SECRET });
const db = norm.use(Identity, Shortener);

// db.repo(key) returns a typed repository for a registered entity.
const users = db.repo('Users');
const links = db.repo('Links');
```

`db.repo(key)` returns one of three accessor shapes, chosen by the
entity's kind:

- **`TABLE`** entities return a full `Repo` — reads **and** writes.
- **`VIEW`** entities return a `ReadRepo` — the read surface only.
- **`QUERY`** entities (stored SELECTs) return a `QueryAccessor` — a
  single `find({ limit?, offset? })` that re-issues the stored query.

The read methods (`find`/`findOne`/`getByPK`/`count`) live on every
`Repo` and `ReadRepo`; the write methods
(`insert`/`update`/`delete`/`upsert`/`truncate`) live on `Repo` only.

## The result envelope

Every operation resolves to a single `NormResult` envelope. It rides
on the engine's result and adds correlation metadata:

| Field     | Type                     | Meaning                                                                                                  |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `id`      | `string`                 | A ULID minted per operation; the SAME id is stamped on the `call` event.                                 |
| `op`      | `string`                 | The executed operation — `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `COUNT`, `UPSERT`, `TRUNCATE`, `RAW`.   |
| `count`   | `number`                 | Rows in THIS result for reads (pagination applies!), affected rows for writes, the answer for `count()`. |
| `time`    | `number`                 | Engine-reported duration in milliseconds.                                                                |
| `isSlow`  | `boolean`                | Whether the engine flagged the call as slow.                                                             |
| `data?`   | `P`                      | Present on data-bearing ops; **absent entirely** on count-only ops.                                      |
| `total?`  | `number`                 | Only on `find(filter, { total: true })` — matching rows regardless of paging.                            |
| `scoped?` | `Record<string,unknown>` | The equality scope filter that was applied (keyed by `@column`), for auditing.                           |
| `txId?`   | `string`                 | Present iff the op ran on a transaction-scoped handle.                                                   |

`data` is typed exactly per method: `Row[]` for `find`/`insert`/
`upsert`, `Row | null` for `findOne`/`getByPK`, and **not present at
all** for `count`/`update`/`delete`/`truncate` (the answer rides
`count`). For reads, `count` is the size of THIS page — use
`total: true` when you need the full match count under pagination.

```typescript ignore
const r = await db.repo('Users').find({ '@role': 'admin' });
r.id; // '01J...' — correlate with the `call` event
r.op; // 'SELECT'
r.count; // rows in this page
r.data; // typed row array
r.isSlow; // engine slow-query flag
```

## Reading: find, findOne, getByPK, count

### find(filter?, options?)

The **filter is the first positional argument**, not an option. The
second argument is `FindOptions`:

```typescript ignore
type FindOptions = {
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  project?: ProjectionInput; // typed projection (see Projections)
  aggregates?: AggregateInput; // grouped report queries (see Aggregates)
  limit?: number;
  offset?: number;
  decrypt?: boolean; // default true; false leaves ciphertext
  total?: boolean; // also run a matching COUNT → result.total
};
```

```typescript ignore
const admins = await db.repo('Users').find({ '@role': 'admin' }, {
  orderBy: { '@displayName': 'ASC' },
  limit: 20,
  project: { '@id': true, '@displayName': true },
  total: true,
});
admins.data; // ProjectedRowOf<...>[] — { id, displayName }[]
admins.total; // total matching admins, ignoring the limit
```

A limit-less read pages at the entity's `defaultPageSize` (10 unless
the entity declares otherwise). A `limit` of `0` — passed or declared —
means **UNBOUNDED** and emits a `warning` event on every such read.

`decrypt: false` leaves encrypted columns as their stored ciphertext,
touches no secret, and skips `afterRead` transforms on those columns —
useful for bulk exports that never need plaintext.

### findOne(filter?, options?)

Returns the first matching row (even when several match) or `null`.
It takes the same options as `find` except `limit` (forced to 1):

```typescript ignore
const one = await db.repo('Users').findOne({ '@email': 'ada@shortly.dev' });
one.count; // 0 or 1
one.data?.role; // string | undefined

const withProfile = await db.repo('Users').findOne({ '@id': someId }, {
  project: { '@id': true, '@Profile': { '@bio': true } },
});
withProfile.data?.Profile; // { bio: string } | null
```

### getByPK(pk, options?)

Fetch one row by primary key (all columns for a composite key). Options
are `{ project?, decrypt? }`:

```typescript ignore
const user = await db.repo('Users').getByPK({ id: someId });
user.data; // DefaultRowOf<...> | null

// Composite primary key — every key column is required:
const tag = await db.repo('PostTags').getByPK({ postId: 1, tagId: 2 });
```

### count(filter?)

Counts matching rows. The answer rides `count`; the envelope has **no
`data`**. An empty `{}` filter counts all rows.

```typescript ignore
const n = await db.repo('Users').count({ '@role': 'viewer' });
n.count; // number

// Joined filter on a COUNT — a real SQL join under the hood:
const c = await db.repo('Visits').count({ '@Link.@slug': 'link-00' });
```

## Filters

Filters are the OQL filter language typed to your columns. A bare
`@column` key is equality shorthand; an operator bag applies one of the
operators below; `$and` / `$or` compose sub-filters.

### Equality shorthand

```typescript ignore
await db.repo('Users').find({ '@role': 'admin' }); // role = 'admin'
await db.repo('Links').find({ '@isActive': true }); // isActive = true
```

### Operators

| Operator   | Meaning                                  |
| ---------- | ---------------------------------------- |
| `$eq`      | Equal (the shorthand's long form).       |
| `$ne`      | Not equal.                               |
| `$in`      | Value in a list.                         |
| `$nin`     | Value not in a list.                     |
| `$like`    | Pattern match (`%`, `_`).                |
| `$ilike`   | Case-insensitive pattern match.          |
| `$between` | Inclusive range `[low, high]`.           |
| `$null`    | `$null: true` / `false` — IS (NOT) NULL. |
| `$or`      | Any sub-filter matches.                  |
| `$and`     | All sub-filters match.                   |

```typescript ignore
// $in over a hashed column — plaintext equality, rewritten to digests:
await db.repo('Users').find({
  '@email': { $in: ['bob@shortly.dev', 'eve@shortly.dev'] },
});

// $like / $between / $null on plain columns:
await db.repo('Links').count({ '@slug': { $like: 'link-1%' } });
await db.repo('Links').count({ '@id': { $between: [5, 8] } });
await db.repo('Links').count({ '@expiresAt': { $null: true } });

// $or composition:
await db.repo('Users').find({
  $or: [{ '@email': 'ada@shortly.dev' }, { '@role': 'admin' }],
});
```

### Relation references

A `'@Alias.@col'` key filters through a foreign-key alias or a reverse
relation. The relation name comes from your FK declaration:

```typescript ignore
// belongsTo: Links → Owner (a Users FK):
await db.repo('Links').find({ '@Owner.@role': 'viewer' });

// Cross-schema belongsTo on a COUNT:
await db.repo('Visits').count({ '@Link.@slug': 'link-00' });
```

Filtering **through** a to-many relation that is **not** projected is
lifted into a correlated `$exists` subquery, so it never fans out — a
base row matching N related rows still comes back once, and `count()`
does not over-count:

```typescript ignore
// Every link with at least one visit from 'IN' — each link ONCE:
const inLinks = await db.repo('Links').find({ '@Visits.@country': 'IN' });
inLinks.count; // distinct links, no join fan-out

// count() agrees; total:true rides the same EXISTS plan:
await db.repo('Links').count({ '@Visits.@country': 'IN' });
await db.repo('Links').find({ '@Visits.@country': 'IN' }, {
  orderBy: { '@slug': 'ASC' },
  limit: 10,
  total: true,
});
```

A relation column may also appear in **value** position — the right-hand
side of an operator, for a cross-column comparison. That plans the join
for a belongsTo / hasOne alias, but an **unprojected to-many** cannot
supply a comparison value (it runs as an `EXISTS` subquery, which has
nothing to compare an outer column against), so that spelling throws
rather than silently comparing against the literal text:

```typescript ignore
// belongsTo in value position — joins, compares column to column:
await db.repo('Links').find({ '@createdAt': { $gt: '@Owner.@createdAt' } });

// Unprojected to-many in value position — NormQueryError. Project the
// relation (it then joins), or write the condition key-position.
await db.repo('Owners').find({ '@name': { $gt: '@Items.@label' } });
```

### Hashed columns (encrypted, filterable by plaintext)

A column declared `.encrypt().hash()` stores ciphertext but stays
filterable: equality-class operators against the **plaintext** are
transparently rewritten to digest equality on the synthesized
`<col>_hash` sibling — with the same `beforeWrite` normalization the
write path applies. Digests support equality only:
`$eq` / `$ne` / `$in` / `$nin` / `$null`.

```typescript ignore
// Filter by plaintext — rewritten to email_hash = sha256('ada@...').
// beforeWrite trims + lowercases, so this matches regardless of case:
const one = await db.repo('Users').findOne({
  '@email': '  Ada@Shortly.Dev  ',
});
```

A standalone `Column.hash(algo)` digest column (e.g. a PIN) works the
same way — store and filter by the plaintext, never see it again:

```typescript ignore
const byPin = await db.repo('Users').findOne({ '@pin': '4471' });
```

### Non-filterable columns

References that cannot be filtered throw a `NormQueryError` **before**
any SQL runs:

- An **encrypted-without-`.hash()`** column — ciphertext is
  IV-randomized, so equality is meaningless. Declare `.hash()` to
  enable plaintext equality.
- A column marked `.unfilterable()`.
- Ordering or aggregating an **encrypted** column — randomized
  ciphertext neither sorts nor groups.

## Projections

`project` reshapes result rows. Every key is a `@`-prefixed name — a
local column, a rename, or a relation. The return type is derived
exactly from the projection literal (`ProjectedRowOf`), and invalid
keys are **compile errors** at the offending key (`ValidProjection`),
not runtime throws.

### Local columns and renames

```typescript ignore
// Pick columns:
const slim = await db.repo('Users').find(undefined, {
  project: { '@id': true, '@displayName': true },
});
slim.data[0]; // { id: string; displayName: string }

// Rename with a string value ('@title' → headline):
const renamed = await db.repo('Links').find(undefined, {
  project: { '@slug': true, '@targetUrl': 'url' },
});
renamed.data[0]; // { slug: string; url: string }
```

Columns marked `hidden()` are excluded from default reads but remain
**opt-in projectable** — name one explicitly to include it.

### Relation sub-projections

A relation key takes `true` (whole relation, target's default-read
shape), a string (whole relation, renamed), or a nested
`{ '@col': true | 'rename' }` sub-projection. Projections are **depth-1
by construction** — a whole-relation target expands to its own LOCAL
default shape, never recursing further.

```typescript ignore
// belongsTo → object | null; sub-projection with a rename:
const links = await db.repo('Links').find({ '@Owner.@role': 'viewer' }, {
  project: {
    '@slug': true,
    '@Owner': { '@displayName': 'owner' },
  },
});
links.data[0]!.Owner; // { owner: string } | null

// hasMany reverse relation → array:
const adaView = await db.repo('Users').findOne({ '@id': adaId }, {
  project: {
    '@id': true,
    '@Links': { '@slug': true }, // owns these
    '@CreatedLinks': { '@slug': true }, // created these
  },
});
adaView.data?.Links; // { slug: string }[]
adaView.data?.CreatedLinks; // { slug: string }[]
```

A projection that names **only** relations is rejected — the
JSON-aggregate SELECT needs at least one local grouping key. Include a
local column (e.g. `'@id': true`) alongside the relations.

## Relations

Relations are declared as foreign keys that reference the target's
registry key (see [Schema definition](NORM-Schema.md)). NORM resolves
three cardinalities in query results:

- **belongsTo** — the FK side; always `object | null` (LEFT join).
- **hasOne** — a reverse relation where the FK columns equal the
  source's primary key; `object | null`.
- **hasMany** — any other reverse relation; an array (`[]` when none).

Project a relation by naming its alias. A belongsTo is named by the FK
key; a reverse relation by the FK's `reverseAs` (or the derived name):

```typescript ignore
// hasOne reverse, sub-projected:
const withProfile = await db.repo('Users').findOne({ '@id': adaId }, {
  project: { '@id': true, '@Profile': { '@bio': true } },
});
withProfile.data?.Profile; // { bio: string } | null
```

### Eager relations

A FK declared `project: true` (belongsTo) or `reverseProject: true`
(hasOne reverse) is **eager**: a projection-less read automatically
carries it, as the target's LOCAL default row (depth-1 — eager never
recurses):

```typescript ignore
// Users.Profile is an eager hasOne; a default read carries it:
const adaFull = await db.repo('Users').getByPK({ id: adaId });
adaFull.data?.Profile; // the profile row, or null when absent
```

### Many-to-many through a junction VIEW

Model a M2M as a `VIEW` that joins the junction to the far table and
declares a **logical** foreign key back to the near entity. The M2M
then reads like a plain relation — **one call, one SELECT**, no
junction pivoting:

```typescript ignore
// A tags_of_posts VIEW carries a logical fk to Posts (reverseAs 'Tags'):
const posts = await db.repo('Posts').find(undefined, {
  project: { '@id': true, '@title': true, '@Tags': { '@name': true } },
  orderBy: { '@id': 'ASC' },
});
posts.data[0]!.Tags; // { name: string }[]

// Filtering THROUGH the M2M rides the EXISTS lift (relation not projected):
const denoPosts = await db.repo('Posts').find({ '@Tags.@name': 'deno' });
```

## Aggregates

`find`'s `aggregates` option runs grouped report queries on the typed
surface — no raw IR, no hand-written `GROUP BY`. Each entry names a
function and a **local** `@column`:

```typescript
type AggregateInput = Record<
  string,
  { fn: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'; column: `@${string}` }
>;
```

The projection keys become the `GROUP BY` (OQL auto-groups every
non-aggregated projection key). Aggregate outputs land as the driver
returns them — numbers on SQLite, BIGINT/NUMERIC **strings** on
Postgres/MariaDB — so coerce with `Number(...)` at the call site.

```typescript ignore
// Grouped: visits per country.
const perCountry = await db.repo('Visits').find(undefined, {
  project: { '@country': true }, // the GROUP BY key
  aggregates: { visits: { fn: 'COUNT', column: '@id' } },
  orderBy: { '@country': 'ASC' },
});
perCountry.data[0]; // { country: string; visits: number | string | bigint | null }
Number(perCountry.data[0]!.visits);

// Aggregate-only (no projection keys): a plain SELECT COUNT/MAX, one row.
const summary = await db.repo('Visits').find(undefined, {
  aggregates: {
    total: { fn: 'COUNT', column: '@id' },
    latest: { fn: 'MAX', column: '@id' },
  },
});
Number(summary.data[0]!.total);
```

Aggregates are validated before any SQL and are rejected when they
would be meaningless or ambiguous:

- combined with `total: true` (the total of a grouped query is its row
  count);
- combined with relation projections (relation reads are separate
  queries — group over local columns);
- combined with mask columns (masks compute per row, not per group);
- targeting an **encrypted** column (randomized ciphertext never
  groups) or a non-physical / unfilterable column;
- an unknown function, a non-`@column` target, or an alias that
  collides with a projected key.

### Grouped reports are paged like any other read

A grouped `find()` is **not** exempt from the default page size. With no
explicit `limit` it is capped at the entity's `defaultPageSize` (10
unless declared), which for a report means _the first ten groups_ — and
a truncated report looks exactly like a complete one.

Ask for the page you want:

```typescript ignore
// Every group. Know your cardinality first — this is an unbounded read.
const all = await db.repo('Visits').find(undefined, {
  project: { '@country': true },
  aggregates: { visits: { fn: 'COUNT', column: '@id' } },
  limit: 0,
});

// Or page the report explicitly.
const top = await db.repo('Visits').find(undefined, {
  project: { '@country': true },
  aggregates: { visits: { fn: 'COUNT', column: '@id' } },
  orderBy: { '@country': 'ASC' },
  limit: 100,
});
```

When a grouped read fills the default page exactly, norm emits a
`warning` event with the code `grouped-page-cap` — the truncation is
never silent:

```typescript ignore
norm.on('warning', (entity, op, code, message) => {
  if (code === 'grouped-page-cap') logger.warn({ entity, op }, message);
});
```

`limit: 0` still emits the usual `unbounded-read` warning instead; an
explicit `limit` emits neither, because the page size was your decision.

## Pagination and totals

Page with `limit` + `offset`, and set `total: true` to also receive
the full match count (a second `COUNT` sharing the same rewritten
filter and its joins):

```typescript ignore
const page = await db.repo('Links').find(undefined, {
  orderBy: { '@slug': 'ASC' },
  limit: 10,
  offset: 10,
  total: true,
});
page.count; // 10 — rows on THIS page
page.total; // 25 — all matching rows
page.data[0]!.slug; // 'link-10'
```

`count` reflects the current page; `total` reflects every matching row.
Order by a stable key when paging so successive windows don't overlap.
Ordering by a to-many relation requires **projecting** it — an
unprojected to-many runs as an `EXISTS` subquery, which has no ordering
scope.

## Writes

Write methods live on `Repo` (TABLE entities). Reads and full details
of validation, hooks, encryption, and defaults are covered in
[Schema definition](NORM-Schema.md); the query-side essentials:

### insert

Accepts a single row or an array (batch). Returns the inserted rows
(`RETURNING`) — decrypted, with `hidden()` columns stripped and virtual
masks computed. `count` is the number of returned rows.

```typescript ignore
const created = await db.repo('Users').insert({
  email: 'Ada@Shortly.dev',
  apiKey: 'ak-ada-0001',
  displayName: 'Ada',
  passwordHash: 'bcrypt$ada',
});
created.data[0].email; // 'ada@shortly.dev' (decrypted, normalized)

const batch = await db.repo('Links').insert([
  {
    id: 1,
    slug: 'link-01',
    targetUrl: 'https://x.dev/1',
    ownerId,
    createdById,
  },
  {
    id: 2,
    slug: 'link-02',
    targetUrl: 'https://x.dev/2',
    ownerId,
    createdById,
  },
]);
batch.count; // 2
```

### update / updateByPK

`update(data, filter?)` updates matching rows and returns a count-only
envelope (`count` = affected rows, no `data`). **Omitting the filter
updates ALL rows and emits a warning event** — pass an explicit `{}`
to silence it when you mean "all rows". Hashed columns filter by
plaintext equality here too.

```typescript ignore
await db.repo('Users').update({ loginCount: 1 }, {
  '@email': 'ada@shortly.dev',
});
await db.repo('Users').updateByPK({ displayName: 'Ada L.' }, { id: adaId });

await db.repo('Links').update({ isActive: false }, {}); // ALL rows, no warning
```

### delete / deleteByPK

Symmetric with update: `delete(filter?)` returns a count-only envelope;
a missing filter deletes ALL rows with a warning; `{}` silences it.

```typescript ignore
await db.repo('PostTags').deleteByPK({ postId: 1, tagId: 2 });
await db.repo('PostTags').delete({}); // explicit all-rows, no warning
```

### upsert

`upsert(data, { conflictKeys, updateOnConflict?, decrypt? })` inserts,
or updates on conflict. Returns the resulting rows. An **encrypted**
column can never be a conflict key (nondeterministic ciphertext) — use
its `<col>_hash` sibling; and updating an encrypted+hashed column
auto-syncs its digest sibling so plaintext lookups keep working.

```typescript ignore
await db.repo('Links').upsert({
  id: 500,
  slug: 'link-00', // collides with the unique index
  targetUrl: 'https://x.dev/replaced',
  ownerId,
  createdById,
}, { conflictKeys: ['slug'], updateOnConflict: ['targetUrl'] });
```

On a `db.scope(...)` handle, `upsert` enforces the scope like
`insert`/`update` — the scope column is auto-filled (and may be omitted
from the payload), a contradicting payload is rejected, and the write
can never adopt or overwrite another scope's row: a pre-flight probe
refuses with `SCOPE_VIOLATION` when the statement could collide with an
out-of-scope row, on **every** dialect. That probe is **one extra
`SELECT` round-trip before the write** — a scoped `upsert` is two
statements where an unscoped one is a single write — skipped only when
the payload supplies no comparable key for it to check. The `ON CONFLICT`
target itself is emitted exactly as you spell it unless the entity
declares a unique group covering scope + `conflictKeys`, in which case
the scope is folded in as well; that folded shape is also what closes
the probe's check-then-act race. See
[Scoping](NORM-Scoping.md#how-the-cross-scope-guarantee-is-enforced).

### truncate

Removes every row. Count-only envelope (`op: 'TRUNCATE'`, `count: 0`);
pass `{ cascade: true }` where the dialect supports it.

```typescript ignore
await db.repo('Visits').truncate();
await db.repo('Links').truncate({ cascade: true });
```

`truncate` **refuses** on a `db.scope(...)` handle: `TRUNCATE` carries
no `WHERE`, so it would empty every scope's rows — use `delete({})` to
clear only the current scope. See [Scoping](NORM-Scoping.md#writes).

## Escape hatches

When the typed surface can't express a query, drop to one of two escape
hatches. **Both bypass the typed pipeline** — no scope, no validation,
no hashed-filter rewrite — and `raw` also skips decryption.

### db.query(ir, { entity? })

Runs a hand-built OQL IR through the dialect translator. Rows come back
RAW by default; **bind to an entity** to ride the read pipeline's
decrypt + decode + `afterRead` column transforms:

```typescript ignore
// Entity-bound: email comes back decrypted.
const bound = await db.query({
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email'],
  projection: { '@id': true, '@email': true },
  where: { '@id': adaId },
}, { entity: 'Users' });
bound.data[0]!.email; // 'ada@shortly.dev'

// Unbound: ciphertext stays ciphertext.
const raw = await db.query({
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email'],
  projection: { '@id': true, '@email': true },
  where: { '@id': adaId },
});
```

Binding does NOT apply hashed-filter rewrites (the IR already ran),
masks, or the `afterRead` row hook.

### db.raw(sql, params)

Runs a hand-written SQL string with named `:param:` placeholders, bound
to the connection/transaction. Rows come back exactly as the driver
returns them (no decrypt, no `afterRead`), and it emits a `warning`
event so audits can see the escape hatch in use. SQL engines only —
MongoDB throws `NormUnsupportedError`.

**Always** pass values through `params`; never interpolate into the
string — parameterized values are the injection-safe path.

```typescript ignore
const r = await db.raw<{ n: number | bigint }>(
  'SELECT count(*) AS n FROM users WHERE role = :role:',
  { role: 'viewer' },
);
Number(r.data[0]!.n);

// Encrypted columns stay ciphertext through raw — decrypt by hand:
const rows = await db.raw<{ email: string }>(
  'SELECT email FROM users WHERE id = :id:',
  { id: adaId },
);
const plain = await db.decrypt(rows.data[0]!.email);
```

## Related documentation

- [Schema definition](NORM-Schema.md) — columns, entities, relations,
  hooks, validators, encryption markers.
- [Security](NORM-Security.md) — encryption, digest columns, masks, and
  the crypto override hooks.
- [Scoping](NORM-Scoping.md) — tenant scoping and always-on default
  filters that ride every read and write.
- [Migrations](NORM-Migrations.md) — the `Migrator` workflow.

---

[← Back to NORM](../README.md)
