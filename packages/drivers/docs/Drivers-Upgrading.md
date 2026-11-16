# Upgrade notes

Changes that alter what an existing app stores, reads or gets as an
error when it moves to a newer drivers. A change that only adds an API is
not listed; the changelog has those.

## Table of Contents

- [1.9.0](#190)
  - [A Postgres session runs in UTC](#a-postgres-session-runs-in-utc)
  - [Neon refuses a session that is not in UTC](#neon-refuses-a-session-that-is-not-in-utc)
  - [Neon types a `Date` parameter as `timestamptz`](#neon-types-a-date-parameter-as-timestamptz)
  - [MariaDB sessions and `Date` values are UTC](#mariadb-sessions-and-date-values-are-utc)
  - [A `:name:` in quoted text or a comment is text](#a-name-in-quoted-text-or-a-comment-is-text)
  - [A colon after a colon never opens a placeholder](#a-colon-after-a-colon-never-opens-a-placeholder)
  - [Error codes and messages](#error-codes-and-messages)
  - [SQLite binds `-0` as `0` and whole numbers as integers](#sqlite-binds--0-as-0-and-whole-numbers-as-integers)

## 1.9.0

Each entry compares drivers 1.8.0 with the current release. Where the app
host and the database both run on UTC, the Postgres and MariaDB zone
changes alter no stored value.

### A Postgres session runs in UTC

The driver now sends `TimeZone=UTC` in its startup message. A database or
role set to another zone connects and runs in UTC, and `RESET ALL` and
`DISCARD ALL` return to UTC. drivers 1.8.0 ran the session in that zone,
so a `Date` written to a `date` or `timestamp` column stored that zone's
day and clock time.

Rows 1.8.0 wrote that way keep the old zone's clock, and filters now
compare them in UTC. Convert each `timestamp` column once:

```sql
UPDATE events
SET starts_at = (starts_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC';
```

A `date` column holds the old zone's day, with no time to convert from.

When the server still reports a zone that is not UTC, for example behind
a pooler that does not pass the parameter on, `connect()` throws
`EngineError` `INVALID_CONFIG_VALUE`; 1.8.0 connected. A pooler that
rejects a `TimeZone` startup parameter fails the connection.
`allowNonUtcTimeZone: true` sends no `TimeZone` and checks nothing, as
1.8.0 did. [Postgres → Time zone](../engines/postgres/Drivers-Postgres.md#time-zone)
has the fixes.

### Neon refuses a session that is not in UTC

The first query or `ping()` on a connected engine reads the session zone
in one extra request. A zone that is not UTC rejects the query with
`INVALID_CONFIG_VALUE`, and `ping()` rejects with it rather than
returning `false`. When the zone request itself fails, bad credentials
included, the query rejects with `OPERATION_FAILED` and `ping()` returns
`false`. drivers 1.8.0 checked nothing. `allowNonUtcTimeZone: true`
skips the request. See
[Neon → Time zone](../engines/neon/Drivers-Neon.md#time-zone).

### Neon types a `Date` parameter as `timestamptz`

drivers 1.8.0 sent a `Date` as untyped text. Its placeholder is now
typed `timestamptz`, as on the socket engine, so `date_trunc('day', :at:)`
runs. Against a `date` column, `d = :at:` matches only a `Date` at UTC
midnight, and against a `text` column, `t = :at:` fails with
`operator does not exist`. Pass an ISO string where the text comparison
was meant.

### MariaDB sessions and `Date` values are UTC

| What                                         | drivers 1.8.0                           | Now                              |
| -------------------------------------------- | --------------------------------------- | -------------------------------- |
| the session `time_zone`                      | the server's, `SYSTEM`                  | `+00:00`, so `NOW()` is UTC      |
| a `Date` parameter, also inside an array     | the app host's local clock              | its UTC clock                    |
| `DATE`, `DATETIME` and `TIMESTAMP` on a read | in the app host's zone                  | in UTC                           |
| an Invalid Date parameter                    | sent as `'NaN-NaN-NaN NaN:NaN:NaN.NaN'` | `EngineError` `OPERATION_FAILED` |

A row 1.8.0 wrote from a host outside UTC holds that host's clock, and
reads back shifted by its offset. Convert it once, from the old host's
zone to UTC. See
[MariaDB → Type round-trips](../engines/maria/Drivers-Maria.md#type-round-trips).

### A `:name:` in quoted text or a comment is text

Every SQL engine now skips quoted text and comments when it looks for
placeholders, by the dialect's own quoting rules, listed under
[Named parameters](Drivers-SQLEngine.md#named-parameters).

| Statement, with `{ a: 1 }`                 | drivers 1.8.0                                    | Now                                                   |
| ------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| `SELECT ':a:'`                             | `'$1'` on Postgres, `':a'` on MariaDB and SQLite | `':a:'`                                               |
| `SELECT ':zz:'`                            | `MISSING_PARAMETERS` for `zz`                    | `':zz:'`                                              |
| `SELECT :a: -- :b:`                        | `MISSING_PARAMETERS` for `b`                     | `1`                                                   |
| `SELECT :a: /* x /* y */ :b: */`, Postgres | `MISSING_PARAMETERS` for `b`                     | `1`, the nested comment ends where the server ends it |

### A colon after a colon never opens a placeholder

`SELECT now()::date::text` and `SELECT :a:::int::text` run. drivers 1.8.0
threw `MISSING_PARAMETERS` for `date` and `int`. Two placeholders joined
by a lone colon now read as a cast: the Postgres slice `arr[:lo:::hi:]`
fails with `type "hi" does not exist`, so write `arr[:lo:: :hi:]`, which
both versions accept. `:a::b:` with only `a` supplied fails at the server
with a syntax error, where 1.8.0 threw `MISSING_PARAMETERS` for `b`.

### Error codes and messages

| Error                                                                                | drivers 1.8.0            | Now                 |
| ------------------------------------------------------------------------------------ | ------------------------ | ------------------- |
| a CHECK failure on MariaDB                                                           | `QUERY_EXECUTION_FAILED` | `CHECK_VIOLATION`   |
| access denied to a database on MariaDB, errno 1044, as on `CREATE DATABASE` or `USE` | `INVALID_AUTH`           | `PERMISSION_DENIED` |
| an insert naming a column the table lacks, on SQLite, Turso and D1                   | `QUERY_EXECUTION_FAILED` | `COLUMN_NOT_FOUND`  |
| a Postgres server error during startup or login that has no code of its own          | `QUERY_EXECUTION_FAILED` | `CONNECTION_FAILED` |

Messages that ended in a raw placeholder such as `${constraint}` now end
with the name the server reported, which also lands on `context`:

| Error                                                       | Now ends with, for example                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `DUPLICATE_KEY` on MariaDB and MongoDB                      | the key or index, `orders_ref_u`                              |
| `COLUMN_NOT_FOUND` on Postgres, Neon and MariaDB            | the column, `nope`                                            |
| `FOREIGN_KEY_VIOLATION` and `NOT_NULL_VIOLATION` on MariaDB | the key or column                                             |
| `TABLE_NOT_FOUND` on Postgres and MariaDB                   | the table, `users`, on MariaDB with its database, `app.users` |

A SQLite foreign-key failure names no key, so its message ends at the
instance id. The non-UTC refusal on Postgres and Neon also says to set
the zone for the role a pooler signs in as.

A `CONNECTION_FAILED` message now ends with the reason when the engine
reports one, which Postgres and MongoDB do:
`Failed to connect to POSTGRES::app: connect ECONNREFUSED 127.0.0.1:5432`.
Behind PgBouncer, `statementTimeoutMs` still fails the login, now as
`CONNECTION_FAILED` with a message that names `statement_timeout` and says how
to allow it. See
[Postgres → Behind PgBouncer](../engines/postgres/Drivers-Postgres.md#behind-pgbouncer--pgcat--rds-proxy).

### SQLite binds `-0` as `0` and whole numbers as integers

A bound `-0` reads back as `0` on every runtime. drivers 1.8.0 failed
on Deno with `Invalid FFI i32 type, expected integer`, and read back `-0`
on Bun and Node.

On Node a whole number or a boolean was bound as `REAL`, so `:v: / 2`
with `v` 5 was `2.5` and a column with no type stored a `REAL`. It is
now `INTEGER`, as on Deno and Bun, so the same query returns `2`.

---

[← Back to Drivers](../README.md)
