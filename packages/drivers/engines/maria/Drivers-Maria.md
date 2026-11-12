# MariaDB / MySQL Engine

MariaDB / MySQL driver wrapping `npm:mariadb`. The driver uses
per-connection mode (`createConnection`) and lets `BaseEngine`'s pool
own the lifecycle — no double-pooling.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Capabilities

- Connects to MariaDB and MySQL (8.0+ via `mariadb` package)
- Native named parameters (`:name:` rewritten to `:name`)
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
sent as its UTC clock, and a `DATETIME` is read as a UTC clock.

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
