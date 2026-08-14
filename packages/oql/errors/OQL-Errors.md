# OQL Errors

Every failure `@tundralibs/oql` raises with a stable code — what each code
means, what triggers it, and how to keep it from happening.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Error Classes](#error-classes)
- [Error Codes](#error-codes)
- [Code Reference](#code-reference)
- [Handling Errors](#handling-errors)
- [Related](#related)

## Overview

OQL validates a query in three passes, and only the last one produces an
`OqlError`:

| Pass         | Enforced by                                    | Raises                              |
| ------------ | ---------------------------------------------- | ----------------------------------- |
| **Shape**    | the types in `@tundralibs/oql/types`           | a compile-time type error           |
| **Scoping**  | `assertQuery` (`@tundralibs/oql/asserts`)      | `TypeError`                         |
| **Emission** | the translators (`@tundralibs/oql/translator`) | `OqlError` — the codes on this page |

The types validate a query's **shape**; `assertQuery` validates the rules that
span sibling properties (a `having` key naming a declared aggregate, every
referenced column appearing in `columns`) — see
[the shape-vs-scoping note in the type docs](../types/OQL-Types.md). Those
asserts throw plain `TypeError`s, **not** `OqlError`s. Nothing in
`packages/oql/asserts` ever throws an `OqlError`; every code below is raised
from `packages/oql/translator` while SQL (or a Mongo pipeline) is being
emitted.

That split is the single most useful thing to know when handling these
errors. A query that passed `assertQuery` can still fail translation, but
only for a narrow set of reasons — overwhelmingly
[`DIALECT_UNSUPPORTED`](#dialect_unsupported), where the query is perfectly
well-formed and the target database simply cannot express it. Most of the
other codes are defence-in-depth: the assert layer already rejects the same
input, so they fire on hand-built queries that skipped validation, or on
values cast past the type system. Where that is the case it is called out
per code below.

## Installation

**Deno:**

```bash
deno add @tundralibs/oql
```

**Bun:**

```bash
bunx jsr add @tundralibs/oql
```

**Node.js:**

```bash
npx jsr add @tundralibs/oql
```

## Error Classes

```
BaseError                  (@tundralibs/utils — typed context, cause, toJSON)
└─ OqlError                (adds .code; catch to match any OQL error)
   └─ DialectUnsupportedError  (code is always DIALECT_UNSUPPORTED)
```

| Class                     | Description                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `OqlError`                | Base class, thrown directly for every code except `DIALECT_UNSUPPORTED`. Carries the structured `context` and exposes `.code`.       |
| `DialectUnsupportedError` | The target dialect cannot express the request. Adds two typed fields, `dialect` and `feature`, alongside the same data in `context`. |

`.code` is a getter over `context.code`, and it is **guarded**: if `context`
carries no code, or a string that is not a key of `OqlErrorCodes`, the getter
returns `'UNKNOWN'` rather than the raw value. So `err.code` is always one of
the 13 codes below, and always safe to `switch` on exhaustively.

`OqlErrorCodes` (also exported from `@tundralibs/oql/errors`) maps each code
to a short label. It is a lookup table for tooling and the guard above — it
is **not** a message template table. Unlike `@tundralibs/cacher` or
`@tundralibs/drivers`, OQL passes a fully-built message to the constructor at
each throw site, so the label in `OqlErrorCodes` is not what you see in
`err.message`.

## Error Codes

All 13 codes in the `OqlErrorCode` union. Branch on `err.code`, never on
message text.

| Code                          | Raised by                 | Meaning                                                                        |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `UNKNOWN`                     | —                         | Never thrown. The `.code` getter's fallback for a missing/unrecognised code.   |
| `DIALECT_UNSUPPORTED`         | `DialectUnsupportedError` | The dialect has no way to express this query, expression, or aggregate.        |
| `INVALID_COLUMN_REF`          | `OqlError`                | A column reference did not begin with the `@` sigil.                           |
| `FILTER_DEPTH_EXCEEDED`       | `OqlError`                | A filter nested deeper than 50 levels of `$and` / `$or` / `$exists`.           |
| `EXISTS_NO_OUTER_TABLE`       | `OqlError`                | A correlated `$exists` was used where there is no outer table to correlate to. |
| `INSERT_COLUMN_NOT_IN_SCHEMA` | `OqlError`                | INSERT `data` named a column that is not in the query's `columns`.             |
| `JOIN_NO_COLUMNS`             | `OqlError`                | A join alias was projected whole, but the join declares no columns.            |
| `ALTER_VIEW_EMPTY`            | `OqlError`                | `ALTER_VIEW` carried neither `renameTo` nor `query`.                           |
| `INVALID_AGGREGATE_COLUMN`    | `OqlError`                | An aggregate's `column` was neither a column reference nor an expression.      |
| `UNHANDLED_EXPRESSION`        | `OqlError`                | An expression was given object-shaped `args` its type does not accept.         |
| `PARAM_INLINE_UNSUPPORTED`    | `OqlError`                | A view body needed literal inlining under a non-`named` placeholder format.    |
| `NON_FINITE_LITERAL`          | `OqlError`                | A view body needed to inline `NaN` or `Infinity` as a SQL literal.             |
| `INVALID_TIME_UNIT`           | `OqlError`                | MongoDB date arithmetic was given an unrecognised `unit`. **Mongo only.**      |

## Code Reference

Each entry lists what the code means, what triggers it, and what to change.
"Extra context" names the keys added to `err.context` beyond `code`.

### `UNKNOWN`

**Never thrown.** No throw site in the package constructs it. It exists as
the fallback the `.code` getter returns when `context.code` is absent or is
not a recognised code — the guard that makes `err.code` safe to `switch` on.
You can only observe it on an `OqlError` constructed outside this package
without a valid code. Seeing it means the error did not come from an OQL
throw site; inspect `err.context` and `err.cause` directly.

### `DIALECT_UNSUPPORTED`

The one code a fully valid, `assertQuery`-clean query can still produce, and
the only one carried by a distinct class. The query is well-formed; this
dialect just cannot express it.

**Triggered by** two layers. The shared dispatch in `AbstractTranslator`
raises it when a capability flag is off — `CREATE_SCHEMA`, `DROP_SCHEMA`,
`TRUNCATE`, `RIGHT JOIN`, `FULL JOIN` — or when the dialect's expression /
aggregate map has no emitter for the node. Each concrete translator raises it
for its own grammar gaps, for example:

- **SQLite** — `ALTER COLUMN`, `ALTER CONSTRAINT`, `CREATE_VIEW` with
  `orReplace`, and a rename-only `ALTER_VIEW` (supply a `query` to redefine).
- **MongoDB** — `CREATE_SCHEMA` (databases are implicit), `distinct` on
  `SELECT` / `COUNT`, `STRING_AGG`, correlated `$exists` filters, and column
  references or expressions in positions a Mongo find-filter cannot take.

**Fix:** read `err.dialect` and `err.feature` — the `feature` string is
written for a human and usually names the workaround inline. The full
per-dialect picture, including the cases OQL degrades silently instead of
throwing, is in the
[compatibility matrix](../docs/Compatibility.md).

**Note:** MongoDB also reuses this code for one non-capability failure — an
`UPSERT` row missing a concrete value for a conflict key. That is bad data,
not a missing feature; the `feature` string spells it out.

**Extra context:** `dialect`, `feature` (also available as typed fields on
`DialectUnsupportedError`).

### `INVALID_COLUMN_REF`

A column reference reached the translator without its `@` sigil. OQL
distinguishes a column reference from a literal by that prefix alone, so
`'name'` is the string `name` while `'@name'` is the column.

**Triggered by** a bare identifier where a reference belongs — a projection
key, an aggregate's `column`, an order-by entry. **Fix:** prefix it with `@`
(`'@name'`, or `'@Profile.@bio'` for a joined column). `assertQuery` and the
`columnIdentifier` asserts already reject this, so a validated query cannot
reach it.

**Extra context:** `ref` — the offending string.

### `FILTER_DEPTH_EXCEEDED`

The filter translator recursed past its hard limit of 50 levels. The counter
increments through nested `$and` / `$or` branches and is carried into
`$exists` sub-filters, so deeply nested boolean trees and deeply chained
subqueries share the budget.

**Triggered by** programmatically assembled filters far more often than
hand-written ones — a builder that wraps each added condition in a fresh
`$and` will hit 50 quickly. **Fix:** flatten. `$and` and `$or` take arrays,
so a single `$and: [a, b, c, …]` costs one level where nesting costs one per
condition. There is no option to raise the limit; it guards against stack
exhaustion on cyclic or runaway input.

**Extra context:** `depth`.

### `EXISTS_NO_OUTER_TABLE`

An `$exists` / `$nexists` filter tried to correlate a value back to a column
of the outer query, in a position where OQL has no outer table name to
qualify it with. Emitting the reference unqualified would silently bind it to
the **subquery's** table (innermost `FROM` wins in SQL), quietly changing the
predicate's meaning, so OQL refuses instead.

**Triggered by** a correlated `$exists` inside a `CREATE_INDEX` partial-index
predicate — the only filter position OQL translates without a surrounding
query. Correlated `$exists` in a `SELECT` / `COUNT` / `UPDATE` / `DELETE`
`where` is fully supported: those call sites pass the query's own table as
the correlation context.

**Fix:** drop the correlation from the index predicate — a partial index can
only test columns of the table it indexes. If you need the correlated
condition, apply it in the query's `where` instead.

**Extra context:** `ref` — the reference that could not be correlated.

### `INSERT_COLUMN_NOT_IN_SCHEMA`

An `INSERT` / `UPSERT` `data` object used a key that the query's `columns`
array does not declare. `columns` is OQL's schema for the statement, not a
projection hint, so anything outside it is rejected rather than passed
through to the database.

**Triggered by** a typo'd key, or data assembled from a wider object than the
query declares. With multi-row inserts the check runs across every row, so
one stray key in row 40 fails the whole statement. **Fix:** add the column to
`columns`, or strip the key from `data`. `assertInsert` enforces the same
rule, so a validated query cannot reach it.

**Extra context:** `column` — the offending key.

### `JOIN_NO_COLUMNS`

A projection named a join alias whole (`'@Profile'` rather than
`'@Profile.@bio'`), which asks OQL to auto-expand every column of that join
into a JSON row — but the join's `columns` array is missing or empty, so
there is nothing to expand.

**Triggered by** a `joins` entry declared without `columns`. **Fix:** list
the columns on the join definition, or project the individual columns you
want instead of the bare alias. `assertJoin` rejects an empty `columns`
array, so a validated query cannot reach it.

**Extra context:** `join` — the alias that could not be expanded.

### `ALTER_VIEW_EMPTY`

An `ALTER_VIEW` query carried neither `renameTo` nor `query`, leaving nothing
to alter.

**Triggered by** building the query conditionally and having both optional
properties come out `undefined`. **Fix:** supply at least one.
`assertAlterView` requires the same, so a validated query cannot reach it.

Raised by the Postgres, MariaDB, and MongoDB translators. SQLite reaches a
different failure first: it has no `ALTER VIEW` statement at all and emulates
redefinition as `DROP VIEW IF EXISTS` + `CREATE VIEW`, so an `ALTER_VIEW`
without a `query` — with or without a `renameTo` — raises
[`DIALECT_UNSUPPORTED`](#dialect_unsupported) there instead.

**Extra context:** `dialect`.

### `INVALID_AGGREGATE_COLUMN`

An aggregate node's `column` was neither a `@`-prefixed column reference nor
an expression object — the only two things an aggregate can be computed over.

**Triggered by** a raw literal where a reference belongs, e.g.
`{ $$_aggregate: 'SUM', column: 42 }`. **Fix:** pass `'@total'` for a column
or a nested expression node (`{ $$_expression: 'MULTIPLY', args: [...] }`)
for a computed value. The aggregate asserts enforce this, so a validated
query cannot reach it.

**Extra context:** none beyond `code`.

### `UNHANDLED_EXPRESSION`

An expression node reached the argument flattener with object-shaped `args`,
but its type has no object-args handler. Only a fixed set of expressions take
named arguments — `POWER`, `DATE_ADD`, `DATE_DIFF`, `SUBSTR`, `REPLACE`,
`LPAD`, `RPAD`, `ENCRYPT`, `DECRYPT`. Every other expression takes an array
or a single value.

**Triggered by** giving a positional expression named arguments, e.g.
`{ $$_expression: 'CONCAT', args: { a: '@first', b: '@last' } }` instead of
`args: ['@first', '@last']`. Note that an expression type the dialect does
not know at all fails earlier, as
[`DIALECT_UNSUPPORTED`](#dialect_unsupported) — reaching this code means the
type is supported but the argument shape is wrong. **Fix:** pass `args` as an
array. The type system already models each expression's argument shape, so
this needs input cast past it.

**Extra context:** `expression` — the `$$_expression` type.

### `PARAM_INLINE_UNSUPPORTED`

View DDL cannot carry bind parameters — a stored view body has to be literal
SQL — so `createView` / `alterView` inline every parameter back into the
statement. That rewrite is only implemented for the `named` placeholder
format (`:p_0:`).

**Triggered by** a custom translator subclass that sets a `numbered` (`$1`)
or `positional` (`?`) parameter style and then builds a view. Every shipped
SQL translator emits `named` on the way out of this layer, so no built-in
dialect can reach it. **Fix:** override `_inlineParams` in your translator
with the inlining rules your placeholder format needs.

**Extra context:** `format` — the placeholder format that could not inline.

### `NON_FINITE_LITERAL`

While inlining a view body (see above), a parameter's value was `NaN`,
`Infinity`, or `-Infinity`. There is no portable SQL literal for those, and
emitting a silent `NULL` would bake a wrong definition into a stored view.

**Triggered by** a computed number reaching a view's `where` or projection —
classically a division that produced `Infinity`. Note this is specific to
view DDL: in an ordinary `SELECT` the same value is passed as a bind
parameter and never rendered as a literal. **Fix:** guard the value with
`Number.isFinite` before building the view, and decide explicitly what the
view should say — usually a `NULL` or a sentinel you write yourself.

**Extra context:** `value` — the offending number.

### `INVALID_TIME_UNIT`

**MongoDB only.** A `DATE_ADD` / `DATE_DIFF` expression carried a `unit` that
is not one of OQL's time units (`DAYS`, `HOURS`, `MINUTES`, `SECONDS`,
`MONTHS`, `YEARS`).

The Mongo translator maps the unit eagerly, at translation time, so an
unrecognised one is caught here rather than failing inside the aggregation
pipeline. The SQL dialects do not: they render the unit into a
`CASE <unit> WHEN 'DAYS' THEN … END`, which the database evaluates at
execution — an unrecognised unit falls through the `CASE` and yields `NULL`
rather than raising this code. Do not treat the absence of this error on
Postgres, MariaDB, or SQLite as proof the unit was valid.

**Triggered by** a hand-built or cast expression node; the date asserts and
the `TimeUnit` type both reject unknown units. **Fix:** use one of the six
units above.

**Extra context:** `dialect`, `unit`.

## Handling Errors

Catch `OqlError` to match anything OQL raises, then branch on `.code`:

```typescript
import { OqlError } from '@tundralibs/oql/errors';
import { PostgresTranslator } from '@tundralibs/oql/translator';
import type { Query } from '@tundralibs/oql';

type User = { id: number; email: string; age: number };

const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'age'],
  projection: { '@id': true, '@email': true },
  where: { '@age': { $gte: 18 } },
};

const translator = new PostgresTranslator();

try {
  const { sql, params } = translator.select(query);
  console.log(sql, params);
} catch (err) {
  if (err instanceof OqlError) {
    switch (err.code) {
      case 'DIALECT_UNSUPPORTED':
        // Valid query, wrong database — route it or degrade the feature.
        console.error('unsupported on this dialect:', err.message);
        break;
      case 'FILTER_DEPTH_EXCEEDED':
        // A builder ran away — flatten the $and/$or tree.
        console.error('filter nested too deeply:', err.context.depth);
        break;
      case 'INSERT_COLUMN_NOT_IN_SCHEMA':
      case 'INVALID_COLUMN_REF':
      case 'JOIN_NO_COLUMNS':
        // Query bugs — assertQuery would have caught these earlier.
        console.error('malformed query:', err.message);
        break;
      default:
        console.error(`[${err.code}]`, err.message);
    }
  } else {
    throw err;
  }
}
```

`DialectUnsupportedError` is worth its own branch when you support more than
one database, because `dialect` and `feature` are typed fields — enough to
decide whether to fall back or to fail the request:

```typescript
import { DialectUnsupportedError } from '@tundralibs/oql/errors';
import { MongoTranslator } from '@tundralibs/oql/translator';
import type { Query } from '@tundralibs/oql';

const create: Query<'CREATE_SCHEMA'> = {
  type: 'CREATE_SCHEMA',
  schema: 'analytics',
};

try {
  new MongoTranslator().createSchema(create);
} catch (err) {
  if (err instanceof DialectUnsupportedError) {
    // 'MONGO' cannot CREATE SCHEMA — Mongo makes databases implicitly.
    console.warn(`skipping ${err.feature} on ${err.dialect}`);
  } else {
    throw err;
  }
}
```

Validate first, and the surface you have to handle shrinks to the dialect
gaps. `assertQuery` throws `TypeError`, so the two layers are easy to keep
apart:

```typescript
import { assertQuery } from '@tundralibs/oql/asserts';
import { OqlError } from '@tundralibs/oql/errors';
import { SQLiteTranslator } from '@tundralibs/oql/translator';
import type { Query } from '@tundralibs/oql';

const build = (query: Query<'SELECT'>): string => {
  try {
    assertQuery(query);
  } catch (err) {
    // TypeError — malformed or badly scoped. A caller bug, not a dialect gap.
    throw new Error(`invalid query: ${(err as Error).message}`, { cause: err });
  }

  try {
    return new SQLiteTranslator().select(query).sql;
  } catch (err) {
    if (err instanceof OqlError && err.code === 'DIALECT_UNSUPPORTED') {
      // Well-formed, but SQLite cannot emit it — try another dialect.
      throw new Error('query needs a different database', { cause: err });
    }
    throw err;
  }
};
```

Because `OqlError` extends `BaseError`, every instance also carries the
shared contract — useful for structured logging:

```typescript
import { OqlError } from '@tundralibs/oql/errors';

const err = new OqlError('Malformed column reference', {
  code: 'INVALID_COLUMN_REF',
  ref: 'name',
});

err.code; // 'INVALID_COLUMN_REF' — guarded, always a known code
err.context; // { code: 'INVALID_COLUMN_REF', ref: 'name' }
err.cause; // the wrapped upstream error, when one was chained
JSON.stringify(err); // log-friendly structured payload (via toJSON)
```

## Related

- [Types](../types/OQL-Types.md) — the shape layer, and the shape-vs-scoping
  split these errors sit on the far side of.
- [Asserts](../asserts/OQL-Asserts.md) — the runtime validators that catch
  most of these conditions first, throwing `TypeError`.
- [Translator](../translator/OQL-Translator.md) — the layer every code on
  this page is thrown from.
- [Compatibility](../docs/Compatibility.md) — per-dialect feature support;
  the reference for `DIALECT_UNSUPPORTED`.

---

[← Back to OQL](../README.md)
