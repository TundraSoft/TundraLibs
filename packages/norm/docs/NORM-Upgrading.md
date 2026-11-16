# Upgrade notes

Changes that alter what an existing app stores, reads or matches when it
moves to a newer norm. A change that only adds an API is not listed; the
changelog has those.

## Table of Contents

- [1.13.0](#1130)
  - [Postgres and Neon refuse a database that is not on UTC](#postgres-and-neon-refuse-a-database-that-is-not-on-utc)
  - [MariaDB dates are written and read in UTC](#mariadb-dates-are-written-and-read-in-utc)
  - [`date()` holds the UTC day on SQLite and MongoDB](#date-holds-the-utc-day-on-sqlite-and-mongodb)
  - [`time()` reads a string](#time-reads-a-string)
  - [A date-time string with no offset is UTC](#a-date-time-string-with-no-offset-is-utc)
  - [A date no calendar has is refused](#a-date-no-calendar-has-is-refused)
  - [An insert default that reads a column is refused](#an-insert-default-that-reads-a-column-is-refused)
  - [An `updateOnConflict` column a row does not pass is refused](#an-updateonconflict-column-a-row-does-not-pass-is-refused)
  - [Date text that is not ISO 8601 is refused](#date-text-that-is-not-iso-8601-is-refused)
  - [A MongoDB comparison never matches NULL](#a-mongodb-comparison-never-matches-null)
  - [A MongoDB insert stores `null` for a nullable column left out](#a-mongodb-insert-stores-null-for-a-nullable-column-left-out)
  - [`DATE_DIFF` counts complete units and returns a number](#date_diff-counts-complete-units-and-returns-a-number)
  - [A MongoDB filter through a NULL-safe relation is met by one row](#a-mongodb-filter-through-a-null-safe-relation-is-met-by-one-row)
  - [A filter value from a to-one relation that can match several rows needs it projected](#a-filter-value-from-a-to-one-relation-that-can-match-several-rows-needs-it-projected)
  - [A matched relation row whose projected columns are all NULL is kept](#a-matched-relation-row-whose-projected-columns-are-all-null-is-kept)

## 1.13.0

norm 1.13.0, with drivers 1.9.0 and oql 1.6.0, makes dates, times and
NULL behave the same on every engine and on every host.
[Dates and time zones](NORM-Dates.md) describes the result. The fixes
below change what an app written against an earlier version sees. Where
the app host and the database both run on UTC, the first, second and
fifth change nothing.

### Postgres and Neon refuse a database that is not on UTC

`connect()` rejects with `INVALID_CONFIG_VALUE` when the Postgres
session's `TimeZone` is not UTC. On Neon the first query or `ping()`
rejects with the same code. Earlier versions connected, and stored and
filtered the wrong day and clock time in `date()`, `datetime()` and
`timestamp()` columns.

Set the database to UTC, or accept its zone with `allowNonUtcTimeZone`:
[The database session](NORM-Dates.md#the-database-session) shows both.

### MariaDB dates are written and read in UTC

Each connection now runs in UTC and sends a `Date` as its UTC clock.
Earlier versions used the server's zone for the session and the app
host's clock for the value. Where either was not UTC, rows those versions
wrote read back shifted, and nothing converts them:
[MariaDB → Type round-trips](../../drivers/engines/maria/Drivers-Maria.md#type-round-trips)
has the detail.

A `datetime()` column written from a host off UTC holds that host's
clock. Convert it once, from the old host's zone to UTC.

### `date()` holds the UTC day on SQLite and MongoDB

Earlier versions stored the full instant there, so one day written at two
times compared unequal. A read returns the day at UTC midnight for old
and new rows alike. An equality filter matches an old row only after the
column is written again.

### `time()` reads a string

A `time()` column reads back as `'HH:MM:SS'` on every engine, and its
TypeScript type is `string`. Earlier versions typed it `Date`: Postgres
and MariaDB returned an Invalid Date, and SQLite and MongoDB returned the
full instant. Code that called a `Date` method on the value no longer
compiles; [Factories](NORM-Schema.md#factories) lists what a write takes.

### A date-time string with no offset is UTC

`'2026-01-15T10:00:00'` written to a `date()`, `datetime()`,
`timestamp()` or `timestamptz()` column, or given to one as a literal
`.default()` or `.defaultOnUpdate()`, is now 10:00 UTC. Earlier
versions let the runtime read it in the host's zone, so a host off UTC
stored a different instant. A string that names an offset, and a `Date`,
are unchanged.

### A date no calendar has is refused

`'2026-02-30'`, `'2026-02-29'` and `'2026-01-15T24:00:00'` name a day or
time no calendar has. Earlier versions let the runtime move them to a
later day, so `'2026-02-30'` was stored, and matched by a filter, as
March 2. Such a string now fails:

| Where                                                                   | Error                                         |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| A write to a `date()`, `datetime()`, `timestamp()` or `timestamptz()`   | `NormValidationError`, with the column's path |
| A filter value on one of those columns, or `@AsOf` on a temporal entity | `NormQueryError` with code `INVALID_DATE`     |
| A supplied `EffectiveFrom` on a temporal entity                         | `NormQueryError` with code `TEMPORAL_PAST`    |
| A literal `.default()` or `.defaultOnUpdate()` on one of those columns  | `NormDefinitionError` from `Entity()`         |

A `Date` is never refused, and a row an earlier version stored keeps the
shifted day. Validate a date that arrives as text before it reaches norm,
or catch the error. A literal default that is not a date at all also
fails `Entity()` now; earlier versions failed each insert that used it.

### An insert default that reads a column is refused

A `.default()` expression that reads a column of the row, such as
`DATE_ADD` of `'@startsOn'`, now fails `Entity()` with
`NormDefinitionError`. Earlier versions accepted the definition, and
every insert that left the column out threw a plain `TypeError`. Compute
the value in a `beforeInsert` hook instead.

### An `updateOnConflict` column a row does not pass is refused

An `upsert()` whose `updateOnConflict` names a column that a row does not
pass now throws `NormQueryError` with code `UPSERT_CONFLICT_KEY`, before
anything is written. On a conflict, earlier versions copied the column's
insert default over the stored value on every engine, or threw a plain
`TypeError` from oql when the column had no default. A `defaultOnUpdate`
column the rows leave out now takes its update default, where earlier
versions wrote its insert default. Pass the column in every row, or leave
it out of `updateOnConflict`.

### Date text that is not ISO 8601 is refused

A write to a `date()`, `datetime()`, `timestamp()` or `timestamptz()`
column now fails validation, with the column's path, for text that is
not an ISO 8601 date or date-time, such as `'Feb 30 2026'`,
`'Jan 15 2026 10:00'` or `'01/15/2026'`. A supplied `EffectiveFrom` in
that form throws a `NormQueryError` with code `TEMPORAL_PAST`. Earlier
versions handed the text to the runtime's `Date` parser, which read it
in the host's zone and moved `'Feb 30 2026'` to March, so the stored
value depended on the host. A column with its own `.guard()` refuses it
before the guard runs, and a literal default in that form fails
`Entity()` with `NormDefinitionError`. A `Date` and `time()` columns are unchanged, and
a filter value in that form still reaches the engine as it is, as
[Date and time values](NORM-Querying.md#date-and-time-values) says.
Send `YYYY-MM-DD`, or that with a time and an optional offset, or a
`Date`.

### A MongoDB comparison never matches NULL

`$ne` and `$nin` no longer return a document whose field is null or
missing, and two null fields are no longer equal, as on the SQL engines.
To keep those rows, ask for them:
`{ $or: [{ '@status': { $ne: 'BANNED' } }, { '@status': null }] }`.
[NULL in a filter](../../oql/docs/OQL-Compatibility.md#null-in-a-filter)
has the full rule.

### A MongoDB insert stores `null` for a nullable column left out

An insert or upsert that leaves out a nullable column with no default
now stores `null` in the new document, and the row reads back with
`null`, as on the SQL engines. Earlier versions left the field out of the
document, so the row read back without the key. An upsert that updates a
document already stored leaves its other fields as they are.

A document an earlier version or another writer stored without a field
still lacks it, and now reads back with `null` for that column, top-level
and inside relation rows, as does a row an upsert returns unchanged.
Earlier versions returned the row without the key. A filter for `null`
matches the document either way.

### `DATE_DIFF` counts complete units and returns a number

Every engine now returns the same whole `number` for the same two dates:
complete units, with a partial unit dropped, and calendar months and
years. What an earlier version returned depended on the engine:

| Engine   | Earlier versions                                                                               |
| -------- | ---------------------------------------------------------------------------------------------- |
| Postgres | Rounded to the nearest unit, counted 30-day months and 365-day years, and returned a `bigint`. |
| MariaDB  | Every `DATE_DIFF` and `DATE_ADD` failed with a syntax error.                                   |
| SQLite   | Counted 30-day months and 365-day years, and could read an exact gap one unit short.           |
| MongoDB  | Counted unit boundaries crossed: 00:59 to 01:01 was one hour.                                  |

Recheck any threshold compared against a `DATE_DIFF`, and drop code that
handles a `bigint` result.
[DATE_DIFF units](../../oql/docs/OQL-Compatibility.md#date_diff-units)
has worked examples.

### A MongoDB filter through a NULL-safe relation is met by one row

A [NULL-safe](NORM-Schema.md#null-safe-keys) to-one relation can match
several rows. When the read filters through one without projecting it,
MongoDB now returns a row only when one related row meets every
condition on that relation, as the SQL engines do. Earlier versions
tested each condition against any matched row there, so
`{ '@Org.@name': 'x', '@Org.@tier': { $gt: 5 } }` returned a row whose
two orgs each met one condition, and `$ne` held only when no matched row
had the value. A relation whose key matches one row at most reads as
before.

### A filter value from a to-one relation that can match several rows needs it projected

A belongsTo or hasOne relation used as a comparison value, as in
`{ '@id': { $lt: '@Seat.@id' } }`, was joined when the read did not
project it. Where the join columns on the related entity are not unique
there, a row came back once for each related row that passed, and
`count()` and `total` counted it as often. Such a read now throws
`NormQueryError` with the code `INVALID_PROJECTION`, as it already did
for a NULL-safe relation. The check reads the schema, not the data: it
passes when those join columns cover the related entity's primary key or
one of its `unique` groups.

Project the relation and each row comes back once, kept when at least
one related row passes the comparison. `count()` and `total: true` count
without the projection and throw for such a filter. Where the columns
are unique in fact, declare them in the related entity's `unique`
option, which the next migration emits as a unique index; a view has no
such option. [Relation references](NORM-Querying.md#relation-references)
has the rule.

### A matched relation row whose projected columns are all NULL is kept

A related row that matched, but held NULL in every column the read
projected from it, was read as no match: a belongsTo or hasOne read
`null`, and a to-many list left the row out. The to-one relation now
reads an object whose values are `null`, and the list keeps the row. No
match still reads `null` and `[]`. Code that took `row.Org === null` to
mean the projected column was NULL must test the column instead.

One case is unchanged: a view, which has no primary key, joined on
[NULL-safe](NORM-Schema.md#null-safe-keys) pairs that all hold NULL.

---

[← Back to NORM](../README.md)
