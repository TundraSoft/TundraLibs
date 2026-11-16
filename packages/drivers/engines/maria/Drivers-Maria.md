# MariaDB / MySQL Engine

MariaDB / MySQL driver wrapping `npm:mariadb`. The driver uses
per-connection mode (`createConnection`) and lets `BaseEngine`'s pool
own the lifecycle — no double-pooling.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Capabilities

- Connects to MariaDB and MySQL (8.0+ via `mariadb` package)
- Named parameters (`:name:`), each written into the statement as an escaped
  literal (see [Parameters](#parameters))
- `BIGINT` returned as `bigint` (`supportBigInt: true`)
- `DECIMAL` returned as `number` (`decimalAsNumber: true`)
- TLS / SSL support (passes through `ssl` config)
- Transactions (commit / rollback / auto-rollback / timeout)

## Quick Start

```typescript
import { MariaEngine } from '@tundralibs/drivers/maria';

const engine = new MariaEngine('app', {
  host: 'localhost',
  port: 3306,
  database: 'app',
  username: 'root',
  password: '...',
});

const r = await engine.execute({
  sql: 'SELECT id, name FROM users WHERE id = :id:',
  params: { id: 1 },
});

await engine.disconnect();
```

## Configuration

Extends [`SQLEngineOptions`](../../docs/Drivers-SQLEngine.md#configuration).

| Option            | Type     | Default | Notes                                                                                      |
| ----------------- | -------- | ------- | ------------------------------------------------------------------------------------------ |
| `host`            | `string` | —       | Required.                                                                                  |
| `port`            | `number` | `3306`  |                                                                                            |
| `database`        | `string` | —       | Required.                                                                                  |
| `username`        | `string` | —       | Required.                                                                                  |
| `password`        | `string` | —       | Optional.                                                                                  |
| `ssl`             | various  | —       | See [SSL/TLS](../../docs/Drivers-BaseEngine.md#configuration).                             |
| `applicationName` | `string` | `Name`  | Sent as the `program_name` connect attribute (`performance_schema.session_connect_attrs`). |

## Parameters

The driver escapes each `:name:` value into the statement with the
connector's own `escape` and sends the finished text with no values. The
connector never looks for placeholders, so `SELECT @a := 1`, `:a:-1` and a
`:` anywhere else in the statement reach the server as written.

| Value                                | Written as                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `null`                               | `NULL`                                                                                                   |
| `boolean`, `number`, `bigint`        | `true` / `false`, or its digits                                                                          |
| `string`                             | a quoted string, escaped by the connection's rules                                                       |
| `Date`                               | its UTC clock, `'YYYY-MM-DD HH:MM:SS.mmm'`                                                               |
| `Uint8Array`, `Buffer` included      | a hex literal, `X'…'`, so every byte is stored                                                           |
| array                                | its elements, comma-separated, for `IN (:ids:)`                                                          |
| plain object                         | its JSON text, quoted; a GeoJSON geometry such as `{ type: 'Point', coordinates: [1, 2] }` as a geometry |
| `undefined`                          | `EngineError` `MISSING_PARAMETERS`                                                                       |
| `NaN`, `±Infinity`, function, symbol | `EngineError` `OPERATION_FAILED`, `encode parameter`                                                     |

Quoted text is read by the connection's `sql_mode`, taken from the status
flags the server sends with every reply, with no extra round trip. With
`NO_BACKSLASH_ESCAPES` a backslash is an ordinary character both where the
driver looks for placeholders and where it escapes a value, so
`SELECT 'C:\' AS t, :b: AS v` binds `:b:`. With `ANSI_QUOTES` a `"…"` run is
an identifier. MySQL does not report `ANSI_QUOTES`, so there a `"…"`
identifier that ends in a backslash is read as an open string.

A placeholder inside an executable comment, `/*! … */` or `/*M! … */` with or
without a version number, is bound, and one inside an ordinary comment is
text. A server that skips the comment ends it at the first `*/`, so a value
holding `*/` or `/*` is refused there with `OPERATION_FAILED`. Nothing is
bound from an executable comment with no single end onward: one left open,
or holding `/*`, a line comment, or a quote that runs past its `*/`.

Outside a transaction the connection is not known until the query runs. A
statement with a backslash can then name different placeholders by mode, and
its missing parameter is reported when the query runs, still before anything
is sent.

## Type round-trips

| MariaDB type                   | JS                    |
| ------------------------------ | --------------------- |
| `INT` / `SMALLINT` / `TINYINT` | `number`              |
| `BIGINT`                       | `bigint`              |
| `DECIMAL` / `NUMERIC`          | `number`              |
| `FLOAT` / `DOUBLE`             | `number`              |
| `BIT(1)`                       | `boolean`             |
| `VARCHAR` / `TEXT`             | `string`              |
| `BLOB` / `BINARY`              | `Buffer` (Node-style) |
| `JSON`                         | parsed object         |
| `DATE`                         | `Date` (UTC midnight) |
| `DATETIME` / `TIMESTAMP`       | `Date`                |

Dates are written and read in UTC whatever the host's time zone: each
connection sets its session `time_zone` to `+00:00`, a `Date` parameter is
sent as its UTC clock, and a `DATETIME` is read as a UTC clock. The session
zone also applies to SQL you write: `NOW()`, `CURDATE()` and
`CURRENT_TIMESTAMP`, column defaults included, give the UTC clock whatever the
server's `time_zone`.

Existing rows are not converted. Earlier versions of this driver left the
session in the server's zone and sent a `Date` as the host's clock. Where
either was not UTC, a `DATETIME` they wrote holds that clock and is now read
as UTC, and a `TIMESTAMP` reads as the instant stored, which can differ from
what those versions returned.

## Errors

MariaDB error codes (`ER_*`) are mapped to standard `EngineError.code`
values. Both the driver-native `code` (e.g. `ER_DUP_ENTRY`) and the
MariaDB `errno` and `sqlState` are preserved in the error meta for
debugging.

## Soak testing

```bash
deno run --allow-all packages/drivers/engines/maria/soak.ts
```

[← Back to Drivers](../../README.md)
