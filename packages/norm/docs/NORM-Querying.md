# Querying

Read and write data with norm's typed repositories: filters, typed
projections, relations, aggregates, and pagination. Every method on a
repository resolves off your entity declaration, so column names,
operators, projection shapes, and return types are checked at compile
time. A typo is a TypeScript error rather than a runtime surprise.

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
obtain one by constructing a `Norm` from a `database` config and
composing one or more schemas with `use`:

```typescript ignore
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';
import { Identity, Shortener } from './models/mod.ts';

const norm = new Norm({
  database: { dialect: 'sqlite', path: './data' },
  secret: process.env.SECRET,
});
const db = norm.use(Identity, Shortener);

// db.repo(key) returns a typed repository for a registered entity.
const users = db.repo('Users');
const links = db.repo('Links');
```

`db.repo(key)` returns one of three accessor shapes, chosen by the
entity's kind:

- `TABLE` entities return a full `Repo`, with reads and writes.
- `VIEW` entities return a `ReadRepo`, the read surface only.
- `QUERY` entities (stored SELECTs) return a `QueryAccessor`, a single
  `find({ limit?, offset? })` that re-issues the stored query.

The read methods (`find`, `findOne`, `getByPK`, `count`) live on every
`Repo` and `ReadRepo`. The write methods (`insert`, `update`, `delete`,
`upsert`, `truncate`) live on `Repo` only.

## The result envelope

Every operation resolves to a single `NormResult` envelope. It rides on
the engine's result and adds correlation metadata:

| Field     | Type                     | Meaning                                                                                                 |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `id`      | `string`                 | A ULID minted per operation; the same id is stamped on the `call` event.                                |
| `op`      | `string`                 | The executed operation: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `COUNT`, `UPSERT`, `TRUNCATE`, `RAW`.   |
| `count`   | `number`                 | Rows in this result for reads (pagination applies), affected rows for writes, the answer for `count()`. |
| `time`    | `number`                 | Engine-reported duration in milliseconds.                                                               |
| `isSlow`  | `boolean`                | Whether the engine flagged the call as slow.                                                            |
| `data?`   | `P`                      | Present on data-bearing ops; absent on count-only ops.                                                  |
| `total?`  | `number`                 | Only on `find(filter, { total: true })`: matching rows regardless of paging.                            |
| `scoped?` | `Record<string,unknown>` | The equality scope filter that was applied (keyed by `@column`), for auditing.                          |
| `txId?`   | `string`                 | Present only when the op ran on a transaction-scoped handle.                                            |

`data` is typed per method: `Row[]` for `find`, `insert`, and `upsert`;
`Row | null` for `findOne` and `getByPK`; and absent for `count`,
`update`, `delete`, and `truncate`, where the answer rides `count`. For
reads, `count` is the size of this page. Use `total: true` when you
need the full match count under pagination.

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

The filter is the first positional argument, not an option. The second
argument is `FindOptions`:

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
the entity declares otherwise). A `limit` of `0`, passed or declared,
means unbounded and emits a `warning` event on every such read.

`decrypt: false` leaves encrypted columns as their stored ciphertext,
touches no secret, and skips `afterRead` transforms on those columns.
Use it for bulk exports that never need plaintext.

### findOne(filter?, options?)

Returns the first matching row, even when several match, or `null`. It
takes the same options as `find` except `limit`, which is forced to 1:

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

Fetch one row by primary key, supplying every key column for a
composite key. Options are `{ project?, decrypt? }`:

```typescript ignore
const user = await db.repo('Users').getByPK({ id: someId });
user.data; // DefaultRowOf<...> | null

// Composite primary key — every key column is required:
const tag = await db.repo('PostTags').getByPK({ postId: 1, tagId: 2 });
```

### count(filter?)

Counts matching rows. The answer rides `count` and the envelope has no
`data`. An empty `{}` filter counts all rows.

```typescript ignore
const n = await db.repo('Users').count({ '@role': 'viewer' });
n.count; // number

// Joined filter on a COUNT — a real SQL join under the hood:
const c = await db.repo('Visits').count({ '@Link.@slug': 'link-00' });
```

## Filters

Filters are the [OQL filter language](../../oql/README.md#comprehensive-filter-system)
typed to your columns. norm's `FilterOf` type is OQL's own
`QueryFilter` derived over your entity's column shape. A bare `@column`
key is equality shorthand, an operator bag applies one of the operators
below, and `$and` / `$or` compose sub-filters.

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

This guide's examples use the subset above. Because `FilterOf` rides
OQL's own operator typing, every OQL operator type-checks and runs on
the matching column kind: `$gt`, `$gte`, `$lt`, and `$lte` on number,
bigint, and date columns, and `$nlike`, `$nilike`, `$startsWith`,
`$endsWith`, and `$contains` on string columns. See OQL's
[Comprehensive Filter System](../../oql/README.md#comprehensive-filter-system)
for the complete operator grammar per column type.

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

Filtering through a to-many relation that is not projected is lifted
into a correlated `$exists` subquery, so it never fans out. A base row
matching N related rows still comes back once, and `count()` does not
over-count:

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

A relation column may also appear in value position, as the right-hand
side of an operator, for a cross-column comparison. That plans the join
for a belongsTo or hasOne alias. An unprojected to-many cannot supply a
comparison value, because it runs as an `EXISTS` subquery with nothing
to compare an outer column against, so that spelling throws rather than
comparing against the literal text:

```typescript ignore
// belongsTo in value position — joins, compares column to column:
await db.repo('Links').find({ '@createdAt': { $gt: '@Owner.@createdAt' } });

// Unprojected to-many in value position — NormQueryError. Project the
// relation (it then joins), or write the condition key-position.
await db.repo('Owners').find({ '@name': { $gt: '@Items.@label' } });
```

### Hand-written `$exists` / `$nexists` (advanced)

The lift above is norm generating an `$exists` node from an
`'@Alias.@col'` ref. Because `FilterOf` is OQL's own `QueryFilter`,
OQL's raw top-level
[`$exists` / `$nexists`](../../oql/README.md#correlated-exists-filters)
correlated-subquery operators are part of the type too, and they reach
the SQL translator unchanged:

```typescript ignore
// Physical table name ('items'), NOT the entity registry key ('Items') —
// this bypasses norm's alias/entity abstraction entirely.
await db.repo('Owners').find({
  $exists: {
    table: 'items',
    on: { '@ownerId': '@id' }, // subquery-local column : outer column
    where: { '@label': 'x' },
  },
});
```

This is a raw escape hatch rather than a typed norm feature. `table` is
the physical table name, the columns inside `on` and `where` are not
validated against any entity, and none of norm's rewrites (hashed
column to digest, scope filters) apply inside it. Prefer the
`'@Alias.@col'` auto-lift, which is typed and validated and needs no
physical names. Reach for a hand-written `$exists` only for a
correlation OQL can express but norm's relation graph cannot, such as
correlating on a column that is not part of any declared foreign key.

### Hashed columns (encrypted, filterable by plaintext)

A column declared `.encrypt().hash()` stores ciphertext but stays
filterable: equality-class operators against the plaintext are
rewritten to digest equality on the synthesized `<col>_hash` sibling,
with the same `beforeWrite` normalization the write path applies.
Digests support equality only: `$eq`, `$ne`, `$in`, `$nin`, `$null`.

```typescript ignore
// Filter by plaintext — rewritten to email_hash = sha256('ada@...').
// beforeWrite trims + lowercases, so this matches regardless of case:
const one = await db.repo('Users').findOne({
  '@email': '  Ada@Shortly.Dev  ',
});
```

A standalone `Column.hash(algo)` digest column (a PIN, say) works the
same way: store and filter by the plaintext, and never see it again:

```typescript ignore
const byPin = await db.repo('Users').findOne({ '@pin': '4471' });
```

### Non-filterable columns

References that cannot be filtered throw a `NormQueryError` before any
SQL runs:

- An encrypted column without `.hash()`. Ciphertext is IV-randomized,
  so equality is meaningless; declare `.hash()` to enable plaintext
  equality.
- A column marked `.unfilterable()`.
- Ordering or aggregating an encrypted column. Randomized ciphertext
  neither sorts nor groups.

**JSON columns cannot be filtered by path.** OQL supports `@col.@key`
[JSON path filtering](../../oql/README.md#json-column-filtering); norm
does not implement it. norm's relation resolver reads any two-segment
`'@Alias.@col'` key as a foreign-key or reverse-relation reference, JSON
columns included. So `'@payload.@kind'` on a `Column.json<Shape>()`
column type-checks, because the typed path key is inherited from OQL,
but throws `NormQueryError` (`UNKNOWN_RELATION`) at runtime, reporting
`payload` as an unknown relation alias. Filter a JSON column only as a
whole value (`$eq`, `$ne`, `$in`, `$nin`, `$null`). For path-level
filtering, model a VIEW with the extraction baked into its stored
`SELECT`, or drop to `db.query()` with a hand-built IR (see
[Escape hatches](#escape-hatches)).

## Projections

`project` reshapes result rows. Every key is a `@`-prefixed name: a
local column, a rename, or a relation. The return type is derived from
the projection literal (`ProjectedRowOf`), and an invalid key is a
compile error at that key (`ValidProjection`) rather than a runtime
throw.

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
projectable: name one explicitly to include it.

### Relation sub-projections

A relation key takes `true` (the whole relation in the target's
default-read shape), a string (the whole relation, renamed), or a
nested `{ '@col': true | 'rename' }` sub-projection. Projections are
depth-1 by construction: a whole-relation target expands to its own
local default shape and never recurses further.

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

A projection that names only relations is rejected, because the
JSON-aggregate SELECT needs at least one local grouping key. Include a
local column such as `'@id': true` alongside the relations.

## Relations

Relations are declared as foreign keys that reference the target's
registry key (see [Schema definition](NORM-Schema.md)). norm plans the
joins through OQL's [JOIN Support](../../oql/README.md#join-support) and
resolves three cardinalities in query results:

- **belongsTo**, the FK side: always `object | null` (LEFT join).
- **hasOne**, a reverse relation where the FK columns equal the source's
  primary key: `object | null`.
- **hasMany**, any other reverse relation: an array (`[]` when none).

Project a relation by naming its alias. A belongsTo is named by the FK
key; a reverse relation by the FK's `reverseAs` or the derived name:

```typescript ignore
// hasOne reverse, sub-projected:
const withProfile = await db.repo('Users').findOne({ '@id': adaId }, {
  project: { '@id': true, '@Profile': { '@bio': true } },
});
withProfile.data?.Profile; // { bio: string } | null
```

### Eager relations

A FK declared `project: true` (belongsTo) or `reverseProject: true`
(hasOne reverse) is eager: a projection-less read carries it as the
target's local default row. Eager never recurses:

```typescript ignore
// Users.Profile is an eager hasOne; a default read carries it:
const adaFull = await db.repo('Users').getByPK({ id: adaId });
adaFull.data?.Profile; // the profile row, or null when absent
```

### Many-to-many through a junction VIEW

Model a many-to-many as a `VIEW` that joins the junction to the far
table and declares a logical foreign key back to the near entity. The
relation then reads like any other, in one call and one SELECT, with no
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
surface, with no raw IR and no hand-written `GROUP BY`. Each entry
names a function and a local `@column`:

```typescript
type AggregateInput = Record<
  string,
  { fn: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'; column: `@${string}` }
>;
```

The projection keys become the `GROUP BY`; OQL groups every
non-aggregated projection key. Aggregate outputs land as the driver
returns them, numbers on SQLite and BIGINT/NUMERIC strings on Postgres
and MariaDB, so coerce with `Number(...)` at the call site.

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

Aggregates are validated before any SQL and rejected when they would be
meaningless or ambiguous:

- combined with `total: true` (the total of a grouped query is its row
  count);
- combined with relation projections (relation reads are separate
  queries; group over local columns);
- combined with mask columns (masks compute per row, not per group);
- targeting an encrypted column (randomized ciphertext never groups) or
  a non-physical or unfilterable column;
- an unknown function, a non-`@column` target, or an alias that
  collides with a projected key.

### Grouped reports are paged like any other read

A grouped `find()` is not exempt from the default page size. With no
explicit `limit` it is capped at the entity's `defaultPageSize` (10
unless declared), which for a report means the first ten groups, and a
truncated report looks exactly like a complete one. Ask for the page
you want:

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
`warning` event with the code `grouped-page-cap`:

```typescript ignore
norm.on('warning', (entity, op, code, message) => {
  if (code === 'grouped-page-cap') logger.warn({ entity, op }, message);
});
```

`limit: 0` emits the usual `unbounded-read` warning instead, and an
explicit `limit` emits neither, because the page size was your
decision.

## Pagination and totals

Page with `limit` and `offset`, and set `total: true` to also receive
the full match count. The total is a second `COUNT` sharing the same
rewritten filter and joins:

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

`count` reflects the current page and `total` every matching row.
Order by a stable key when paging so successive windows do not overlap.
Ordering by a to-many relation requires projecting it: an unprojected
to-many runs as an `EXISTS` subquery, which has no ordering scope.

## Writes

Write methods live on `Repo` (TABLE entities). Validation, hooks,
encryption, and defaults are covered in
[Schema definition](NORM-Schema.md); this section has the query-side
essentials.

### insert

Accepts a single row or an array (batch). Returns the inserted rows
(`RETURNING`), decrypted, with `hidden()` columns stripped and virtual
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
envelope (`count` is the affected rows; no `data`). Omitting the filter
updates all rows and emits a warning event; pass an explicit `{}` to
silence it when you mean all rows. Hashed columns filter by plaintext
equality here too.

```typescript ignore
await db.repo('Users').update({ loginCount: 1 }, {
  '@email': 'ada@shortly.dev',
});
await db.repo('Users').updateByPK({ displayName: 'Ada L.' }, { id: adaId });

await db.repo('Links').update({ isActive: false }, {}); // ALL rows, no warning
```

### delete / deleteByPK

Symmetric with update: `delete(filter?)` returns a count-only envelope,
a missing filter deletes all rows with a warning, and `{}` silences it.

```typescript ignore
await db.repo('PostTags').deleteByPK({ postId: 1, tagId: 2 });
await db.repo('PostTags').delete({}); // explicit all-rows, no warning
```

### upsert

`upsert(data, { conflictKeys, updateOnConflict?, decrypt? })` inserts,
or updates on conflict, and returns the resulting rows. An encrypted
column can never be a conflict key, since its ciphertext is
nondeterministic; use its `<col>_hash` sibling. Updating an encrypted
and hashed column re-syncs its digest sibling so plaintext lookups keep
working.

```typescript ignore
await db.repo('Links').upsert({
  id: 500,
  slug: 'link-00', // collides with the unique index
  targetUrl: 'https://x.dev/replaced',
  ownerId,
  createdById,
}, { conflictKeys: ['slug'], updateOnConflict: ['targetUrl'] });
```

On a `db.scope(...)` handle, `upsert` enforces the scope like `insert`
and `update`: the scope column is filled in, a contradicting payload is
rejected, and the write can never adopt or overwrite another scope's
row. See
[Scoping](NORM-Scoping.md#how-the-cross-scope-guarantee-is-enforced)
for the pre-flight probe that enforces this on every dialect and the
`unique` shape that turns it into a schema invariant.

### truncate

Removes every row. Count-only envelope (`op: 'TRUNCATE'`, `count: 0`);
pass `{ cascade: true }` where the dialect supports it.

```typescript ignore
await db.repo('Visits').truncate();
await db.repo('Links').truncate({ cascade: true });
```

`truncate` refuses on a `db.scope(...)` handle: `TRUNCATE` carries no
`WHERE`, so it would empty every scope's rows. Use `delete({})` to
clear only the current scope. See [Scoping](NORM-Scoping.md#writes).

## Escape hatches

When the typed surface cannot express a query, drop to one of two
escape hatches. Both bypass the typed pipeline (no scope, no
validation, no hashed-filter rewrite), and `raw` also skips
decryption.

### db.query(ir, { entity? })

Runs a hand-built OQL IR through the dialect translator. Rows come back
raw by default; bind to an entity to ride the read pipeline's decrypt,
decode, and `afterRead` column transforms:

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

Binding does not apply hashed-filter rewrites (the IR already ran),
masks, or the `afterRead` row hook.

### db.raw(sql, params)

Runs a hand-written SQL string with named `:param:` placeholders, bound
to the connection or transaction. Rows come back exactly as the driver
returns them (no decrypt, no `afterRead`), and the call emits a
`warning` event so audits can see the escape hatch in use. SQL engines
only; MongoDB throws `NormUnsupportedError`.

Always pass values through `params` and never interpolate into the
string. Parameterized values are the injection-safe path.

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

- [Schema definition](NORM-Schema.md): columns, entities, relations,
  hooks, validators, encryption markers.
- [Security](NORM-Security.md): encryption, digest columns, masks, and
  the crypto override hooks.
- [Scoping](NORM-Scoping.md): tenant scoping and always-on default
  filters that ride every read and write.
- [Migrations](NORM-Migrations.md): the `Migrator` workflow.

---

[← Back to NORM](../README.md)
