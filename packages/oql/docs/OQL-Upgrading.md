# Upgrade notes

Changes that alter what an existing query returns, matches or throws when
it moves to a newer oql. A change that only adds an API is not listed; the
changelog has those.

## Table of Contents

- [1.6.0](#160)
  - [`DIVIDE` keeps the fraction](#divide-keeps-the-fraction)
  - [`COUNT` is a number](#count-is-a-number)
  - [`MODULO` and `ROUND` results](#modulo-and-round-results)
  - [`CURRENT_TIME` is a UTC `'HH:MM:SS'` string](#current_time-is-a-utc-hhmmss-string)
  - [`DATE_DIFF` counts complete units and returns a number](#date_diff-counts-complete-units-and-returns-a-number)
  - [`DATE_ADD` runs on MariaDB and stops at the month end on SQLite](#date_add-runs-on-mariadb-and-stops-at-the-month-end-on-sqlite)
  - [A computed operand of a pattern operator is matched as written](#a-computed-operand-of-a-pattern-operator-is-matched-as-written)
  - [A filter value naming an expression reads its value](#a-filter-value-naming-an-expression-reads-its-value)
  - [A name in a partial-index `where` is a column](#a-name-in-a-partial-index-where-is-a-column)
  - [SQLite `CURRENT_DATE` and empty `ARRAY_AGG`](#sqlite-current_date-and-empty-array_agg)
  - [MongoDB returns what SQL returns](#mongodb-returns-what-sql-returns)
  - [`$exists` keys: null, and nested](#exists-keys-null-and-nested)
  - [An `orderBy` key needs its `@` prefixes](#an-orderby-key-needs-its--prefixes)
  - [An unknown `UNIX_TIMESTAMP` unit throws](#an-unknown-unix_timestamp-unit-throws)
  - [Errors that changed](#errors-that-changed)
  - [Equal values in a write bind separately](#equal-values-in-a-write-bind-separately)

## 1.6.0

Each entry compares a query written against oql 1.5.0 with the same query
now. [Compatibility](OQL-Compatibility.md) states each rule in full.

### `DIVIDE` keeps the fraction

`7 / 2` was `3` on Postgres and SQLite, and `1 / 3` was `0.3333` on
MariaDB. Every dialect now returns `3.5` and the full double. Wrap the
expression in `FLOOR` where the integer result was wanted.

### `COUNT` is a number

A `COUNT` aggregate, plain or `distinct`, was a `bigint` such as `3n` on
Postgres and MariaDB. It is a `number` on every dialect, exact up to 2^53.
Drop code that compares it with a bigint literal or calls `Number()` on
it. A `count()` query is unchanged.

### `MODULO` and `ROUND` results

| Expression                                      | oql 1.5.0                                    | Now                |
| ----------------------------------------------- | -------------------------------------------- | ------------------ |
| `MODULO` with a `BIGINT` operand, Postgres      | a `bigint`, `1n`                             | a `number`, `1`    |
| `MODULO` with a `DOUBLE` operand, Postgres      | failed: `operator does not exist`            | `2.5 % 2` is `0.5` |
| `MODULO` with a fraction, SQLite                | the remainder of the truncated operands, `0` | `0.5`              |
| `ROUND` with a precision on `NUMERIC`, Postgres | a string, `'7.0'`                            | a `number`, `7`    |

MariaDB still returns a `bigint` for `MODULO` over integer columns, see
[number results](OQL-Compatibility.md#number-results).

### `CURRENT_TIME` is a UTC `'HH:MM:SS'` string

| Dialect  | oql 1.5.0                                                          | Now                           |
| -------- | ------------------------------------------------------------------ | ----------------------------- |
| Postgres | `'07:20:46.17099+00'`, a `TIME WITH TIME ZONE` in the session zone | `'07:20:46'`, a `TIME` in UTC |
| MariaDB  | the session zone's time                                            | UTC                           |
| SQLite   | `'07:20:46'`                                                       | unchanged                     |
| MongoDB  | a `Date`, also when written on insert                              | `'07:20:46'`                  |

Compare it with a string, not a `Date`.

### `DATE_DIFF` counts complete units and returns a number

Every dialect returns the same whole `number` for the same two dates:
complete units, a partial unit dropped, and calendar months and years.

| Dialect  | oql 1.5.0                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres | Rounded, so 47 hours 59 minutes was `48n`. Counted 30-day months and 365-day years, returned a `bigint`, and failed between two `DATE` columns. |
| MariaDB  | Failed with a syntax error.                                                                                                                     |
| SQLite   | Counted 30-day months and 365-day years, so 29 February 2024 to 28 February 2025 was 12 months, and read an exact hour as 0.                    |
| MongoDB  | Counted boundaries crossed, so 00:59 to 01:01 was one hour.                                                                                     |

Recheck thresholds compared against a `DATE_DIFF`, and drop code that
handles a `bigint` result.
[DATE_DIFF units](OQL-Compatibility.md#date_diff-units) has worked
examples.

### `DATE_ADD` runs on MariaDB and stops at the month end on SQLite

Every `DATE_ADD` failed with a syntax error on MariaDB; it now returns a
`Date`. On SQLite a negative amount returned `NULL`, and a month or year
added to a day the target month lacks ran into the next month: 31
January 2024 plus one month was 2 March. It is now 29 February, as on the
other dialects. See
[DATE_ADD month end](OQL-Compatibility.md#date_add-month-end).

### A computed operand of a pattern operator is matched as written

On Postgres, MariaDB and SQLite, a `%`, `_` or `\` in the computed value
of `$startsWith`, `$endsWith` or `$contains` was a wildcard, so
`{ '@s': { $startsWith: { $$_expression: 'LOWER', args: '@p' } } }` with
`p` holding `'50%'` matched `'5000'`. It is now escaped and matches only
text that starts with `50%`, as on MongoDB. Use `$like` for a computed
pattern.

### A filter value naming an expression reads its value

A filter value that is exactly `'@x'`, where `x` is an expression of the
same query, or in `having` an aggregate, compared the text `'@x'`: it
matched no row, and on Postgres a number column failed with
`invalid input syntax`. An UPDATE failed on SQL with
`COLUMN_NOT_FOUND` and matched no row on MongoDB. It now compares against
the value on every dialect, also as a `$like` pattern and inside a list.
A string meant as data that spells such a name now reads the alias.

### A name in a partial-index `where` is a column

On Postgres and SQLite a bare `'@b'` argument of an expression in a
partial-index `where`, and a value `'@b'` naming an indexed column, were
inlined as the text `'@b'`: Postgres failed with `invalid input syntax`,
and SQLite created the index with that condition. Both now read the
column `b`. On MongoDB a value `'@b'` is still the text. See
[Indexes](OQL-Compatibility.md#indexes).

### SQLite `CURRENT_DATE` and empty `ARRAY_AGG`

`CURRENT_DATE` was `'2026-11-16'` and is now
`'2026-11-16T00:00:00.000Z'`, as projected and as written. ARRAY_AGG and
JSON_ROW over no rows were `[]` and are now `NULL`, as on the other
dialects.

### MongoDB returns what SQL returns

These MongoDB results change to the rows the SQL dialects return. The SQL
dialects are unchanged.

| Query                                                                        | oql 1.5.0 on MongoDB                               | Now                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
| `$ne`, `$nin`, `$nlike`, `$nilike` on a null or missing field                | matched it                                         | skips it                  |
| `{ '@a': '@b' }` with both fields null                                       | matched                                            | no match                  |
| a comparison against an expression, `{ $lt: ADD('@b', 1) }`                  | matched nothing                                    | compared per row          |
| `UPPER`, `LOWER` or `SUBSTR` of null                                         | `''`                                               | `null`                    |
| `LENGTH` of null                                                             | the query failed                                   | `null`                    |
| `SUBSTR` without a length                                                    | failed                                             | the rest of the string    |
| a literal string starting with `$` in an expression, `'$s'`                  | the value of field `s`                             | the text `'$s'`           |
| an `@` argument that names no declared column, `'@nope'`                     | a field lookup, `null`                             | the text `'@nope'`        |
| `'@meta.@tag'` as an expression argument                                     | the nested field                                   | the text, as on SQL       |
| COUNT, SUM, AVG or ARRAY_AGG with `distinct: true`                           | not distinct                                       | distinct                  |
| a `count()` filtered on a declared expression                                | `0`                                                | SQL's count               |
| STRING_AGG, or `count()` with `distinct`                                     | threw `DialectUnsupportedError`                    | run                       |
| a column or expression as a pattern operand, a column inside a list or `$in` | threw `DialectUnsupportedError`                    | run                       |
| SUM over no values                                                           | `0`                                                | `null`                    |
| an aggregate without group keys over no rows                                 | no row                                             | one row                   |
| `$exists` and `$nexists` in a SELECT or COUNT                                | threw `DialectUnsupportedError`                    | run                       |
| an UPDATE or DELETE `where` on a declared expression                         | read a field of that name                          | the rows SQL matches      |
| DIVIDE, MODULO or SUBTRACT with three or more operands                       | failed                                             | folded left to right      |
| a join                                                                       | one row per base document, joined rows in an array | one row per joined row    |
| a join `on` naming the base column first                                     | every joined row matched                           | as the other order        |
| a RIGHT or FULL join                                                         | LEFT rows                                          | SQL's rows                |
| any row                                                                      | carried `_id`, the group key in a grouped query    | no `_id` unless projected |
| INSERT_FROM_QUERY                                                            | copied the source `_id`                            | new ids                   |

Joins change in more ways than one row:
[MongoDB join results in earlier releases](OQL-Compatibility.md#mongodb-join-results-in-earlier-releases)
lists them. To keep a null row that a `$ne` now skips, ask for it, as
[NULL in a filter](OQL-Compatibility.md#null-in-a-filter) shows.

### `$exists` keys: null, and nested

On the SQL dialects a `null` value in a `$exists` or `$nexists` `on` map
was emitted as `column = NULL`, so `$exists` matched nothing and
`$nexists` everything. It is now `column IS NULL`. In a nested `$exists`,
a bare `'@name'` `on` value was the text: Postgres failed and MariaDB and
SQLite matched no row. It is now the parent subquery's column.

### An `orderBy` key needs its `@` prefixes

A joined column written `'j.amt'` passed the validator, then threw
`OqlError` `INVALID_COLUMN_REF` on the SQL dialects and failed on MongoDB.
It now throws a `TypeError` from the validator on every dialect. Write
`'@j.@amt'`.

### An unknown `UNIX_TIMESTAMP` unit throws

A `UNIX_TIMESTAMP` with a unit other than `seconds` or `milliseconds`
used as a filter operand ran as seconds on the SQL dialects. It now
throws `OqlError` `INVALID_TIME_UNIT` at translation. A missing unit is
still seconds.

### Errors that changed

| Query                                                                         | oql 1.5.0                                                                      | Now                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| a `null` inside a list filter, `{ '@a': [7, null] }`                          | the null was ignored, or matched NULL on MongoDB                               | `TypeError`                              |
| an unknown time unit under `expressions`                                      | `TypeError`                                                                    | `OqlError` `INVALID_TIME_UNIT`           |
| a lower-case time unit in a filter operand, `'days'`                          | ran on Postgres and SQLite                                                     | `OqlError` `INVALID_TIME_UNIT`           |
| an UPDATE or DELETE filter through a join                                     | `TypeError`                                                                    | `OqlError` `RELATION_FILTER_UNSUPPORTED` |
| `'@j.amt'` for a column of the join `j`, as a key or value                    | `TypeError` as a key; as a value, a database error on SQL                      | `OqlError` `INVALID_COLUMN_REF`          |
| ABS, CEIL, FLOOR or SQRT with more than one operand, ROUND with more than two | the extra operands ignored; ROUND failed on SQLite                             | `TypeError`                              |
| DATE_ADD or DATE_DIFF without a unit                                          | `TypeError`                                                                    | `OqlError` `INVALID_TIME_UNIT`           |
| a malformed expression as a filter value, `NOPE` or `ADD('@b', 'x')`          | `DialectUnsupportedError`, a database error, or rows                           | `TypeError`                              |
| a WHERE value naming an aggregate, a HAVING value naming an expression        | the text compared, or a database error on Postgres                             | `TypeError`                              |
| a Postgres `$like` pattern ending in one backslash                            | `LIKE pattern must not end with escape character`                              | matches a literal backslash              |
| an index `where` with a `DATE_ADD` on Postgres                                | failed in the database                                                         | `DialectUnsupportedError`                |
| an index `where` with a clock or UUID, Postgres and SQLite                    | failed at the create or at the next write; SQLite took UUID as one fixed value | `DialectUnsupportedError`                |
| an index `where` with `$exists`                                               | failed in the database, or `DialectUnsupportedError`                           | `OqlError` `EXISTS_NO_OUTER_TABLE`       |
| an index `where` with any expression on MongoDB                               | an index whose filter held the expression object as a value                    | `DialectUnsupportedError`                |

The `INVALID_TIME_UNIT` message no longer starts with
`Invalid SELECT query: expression '<alias>' is invalid:`, and the
`FilterOperator` message ends with the reason. To match a list or NULL,
put `{ '@a': null }` beside the list in an `$or`.

### Equal values in a write bind separately

On the SQL dialects, equal values written to different columns shared one
placeholder, as in `VALUES (:p_0:, :p_0:)`. Each now has its own,
`VALUES (:p_0:, :p_1:)`, so the SQL text and `params` of an INSERT or
UPDATE change. The rows written do not.

---

[← Back to OQL](../README.md)
