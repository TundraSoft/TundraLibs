# Dates and time zones

norm keeps every date and time in UTC, on every engine and on every
host. A value written from a server in one time zone reads back as the
same instant, the same day, and the same clock time from a server in
another. This page is the map: each rule is stated once, in the section
linked from here.

## Table of Contents

- [Column types](#column-types)
- [Values you write and filter by](#values-you-write-and-filter-by)
- [A day or a clock time in a named zone](#a-day-or-a-clock-time-in-a-named-zone)
- [Defaults and date arithmetic](#defaults-and-date-arithmetic)
- [The database session](#the-database-session)
- [Temporal and audit periods](#temporal-and-audit-periods)
- [Related documentation](#related-documentation)

## Column types

| Builder         | Holds          | Postgres      | MariaDB        | SQLite | MongoDB              |
| --------------- | -------------- | ------------- | -------------- | ------ | -------------------- |
| `date()`        | A calendar day | `DATE`        | `DATE`         | `TEXT` | date at UTC midnight |
| `time()`        | A time of day  | `TIME`        | `TIME(6)`      | `TEXT` | string               |
| `datetime()`    | An instant     | `TIMESTAMP`   | `DATETIME(6)`  | `TEXT` | date                 |
| `timestamp()`   | An instant     | `TIMESTAMP`   | `TIMESTAMP(6)` | `TEXT` | date                 |
| `timestamptz()` | An instant     | `TIMESTAMPTZ` | `TIMESTAMP(6)` | `TEXT` | date                 |

Neon uses the Postgres types; Turso and D1 use the SQLite ones.

The three instant builders differ only in the native type. On Postgres
`datetime()` and `timestamp()` are the same type, and on MariaDB
`timestamp()` and `timestamptz()` are. Each holds the instant as a UTC
value and reads back as a `Date`.

Pick by range and by who else reads the table:

- MariaDB's `TIMESTAMP` has a limited range (it ends in 2038 on servers
  before 11.5), so use `datetime()` for a far-future value.
- On Postgres use `timestamptz()` for a column that anything other than
  norm reads or writes. `TIMESTAMPTZ` is the one type that means the
  same instant in every session time zone.

## Values you write and filter by

A `Date` is written as the instant it is. A date-time string that names
no offset is read as UTC, on a write and in a filter, so a JSON payload
means the same instant on every host. A `date()` column keeps the UTC
day of the value, and a `time()` column keeps an `'HH:MM:SS'` string.

- Writes: [Schema → Factories](NORM-Schema.md#factories).
- Filters:
  [Querying → Date and time values](NORM-Querying.md#date-and-time-values).

## A day or a clock time in a named zone

"Today" in Kolkata and "today" in UTC are different days for part of
every day. `zonedDay`, `zonedTimeOfDay`, and `zonedInstant` turn a day
or a clock time in a named zone into the value a column stores; see
[Schema → Dates in a time zone](NORM-Schema.md#dates-in-a-time-zone).

## Defaults and date arithmetic

`.default(() => new Date())` runs in the application and
`{ $$_expression: 'NOW' }` runs in the database. Both give the current
instant; [Schema → Defaults](NORM-Schema.md#defaults) covers the
MongoDB insert case.

`DATE_ADD`, `DATE_DIFF`, and `DATE_TRUNC` are oql expressions and count
days and months in UTC. oql states their rules:
[DATE_DIFF units](../../oql/docs/OQL-Compatibility.md#date_diff-units),
[DATE_ADD month end](../../oql/docs/OQL-Compatibility.md#date_add-month-end),
and
[temporal precision](../../oql/docs/OQL-Compatibility.md#temporal-precision-fractional-seconds).

## The database session

norm sends and reads UTC values, so the database session has to run in
UTC as well.

| Engine                     | What happens                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Postgres                   | `connect()` throws `EngineError` with code `INVALID_CONFIG_VALUE` when the session `TimeZone` is not UTC. |
| Neon                       | The first query checks the session, and is rejected with the same error.                                  |
| MariaDB                    | The driver sets each connection's `time_zone` to `+00:00`. There is nothing to configure.                 |
| SQLite, Turso, D1, MongoDB | There is no session time zone.                                                                            |

Fix a refused Postgres or Neon database on the server:

```sql
ALTER DATABASE app SET timezone TO 'UTC';
```

To connect without changing the database, pass the driver's
`allowNonUtcTimeZone` through `database`:

```typescript
import { Norm } from '@tundralibs/norm';

const norm = new Norm({
  database: {
    dialect: 'postgres',
    host: 'db.internal',
    username: 'app',
    password: 'app-password',
    database: 'app',
    allowNonUtcTimeZone: true,
  },
});
```

That removes the check and nothing else. With the session in
`Asia/Kolkata`, a row written with `2026-11-14T20:00:00Z` in every
column reads back as:

| Column                      | Reads back                                       |
| --------------------------- | ------------------------------------------------ |
| `date()`                    | `2026-11-15`, and a filter on the 14th misses it |
| `datetime()`, `timestamp()` | `2026-11-15T01:30:00Z`                           |
| `timestamptz()`             | `2026-11-14T20:00:00Z`                           |

Temporal and audit period columns are `datetime()` columns and shift
the same way. Set the option only for a schema whose instants are all
`timestamptz()`, with no `date()` column and no temporal or audit
table. The drivers explain the check:
[Postgres → Time zone](../../drivers/engines/postgres/Drivers-Postgres.md#time-zone)
and [Neon → Time zone](../../drivers/engines/neon/Drivers-Neon.md#time-zone).

## Temporal and audit periods

`EffectiveFrom` and `EffectiveTo` are `datetime()` columns and follow
every rule above. The open-end marker has one rule of its own: give
`sentinel` an offset. See
[Temporal → Options](NORM-Temporal.md#options).

## Related documentation

- [Schema definition](NORM-Schema.md): the column builders and the
  zone helpers.
- [Querying](NORM-Querying.md): filter values on date and time columns.
- [Temporal tables](NORM-Temporal.md) and [Audit tables](NORM-Audit.md):
  the period columns and `@AsOf`.

---

[← Back to NORM](../README.md)
