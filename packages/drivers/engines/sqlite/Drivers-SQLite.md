# SQLite Engine

SQLite driver — runtime-branched wrapper. SQLite is embedded (no wire
protocol), so each runtime ships its own bindings:

| Runtime  | Backend                             | Notes                               |
| -------- | ----------------------------------- | ----------------------------------- |
| Deno     | `jsr:@db/sqlite` (FFI to libsqlite) | Auto-installed                      |
| Bun      | `bun:sqlite` (built-in)             | Zero dependency                     |
| Node 22+ | `node:sqlite` (built-in)            | Preferred                           |
| Node     | `npm:better-sqlite3`                | Fallback when `node:sqlite` missing |

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Capabilities

- File-backed and in-memory (`:memory:`) databases
- Native `:name:` parameters (rewritten to `:name`; on Bun, further
  rewritten to `bun:sqlite`'s `$name` form — the rewrite skips string
  literals, quoted identifiers, and comments, so `strftime('%H:%M', …)` or
  `WHERE code = 'AB:CD'` behave identically across Deno / Bun / Node)
- Per-runtime native bindings auto-selected
- Transactions (commit / rollback / auto-rollback / timeout)

The driver pins the pool to a single shared handle: any `pool.min` /
`pool.max` you pass is **clamped to `1`** — it cannot be overridden.
Concurrent `execute` calls serialize on that one handle automatically, and
`Capabilities.pooledConnections` is `false`.

> **The single handle is a hard invariant, not just a default.** `pool.min` /
> `pool.max` are forced back to `1` in the constructor — before the options
> merge that otherwise lets caller values win — so `pool: { min: 2, max: 5 }`
> still yields exactly one connection. This protects correctness: SQLite
> serializes writers poorly, and in `':memory:'` mode each extra handle would
> be a **separate, empty** database — a table created on one connection would
> simply be missing on another, surfacing as `TABLE_NOT_FOUND`. Other pool
> knobs (`idleTimeoutSeconds`, `acquireTimeoutSeconds`) are still honored.

## Quick Start

```typescript
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

const db = new SQLiteEngine('app', { path: './data' });
// → ./data/app/main.db (directory mode)

await db.execute({
  sql: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
});
await db.execute({
  sql: 'INSERT INTO users (name) VALUES (:name:)',
  params: { name: 'Alice' },
});

await db.disconnect();
```

## Configuration

Extends [`SQLEngineOptions`](../../docs/Drivers-SQLEngine.md#configuration).

| Option     | Type      | Default | Notes                                            |
| ---------- | --------- | ------- | ------------------------------------------------ |
| `path`     | `string`  | —       | Required. Directory path (or `:memory:`).        |
| `readonly` | `boolean` | `false` | Open in read-only mode.                          |
| `create`   | `boolean` | `true`  | Create file if missing (ignored for `:memory:`). |

## Storage layout

`path` selects one of two modes:

- **Memory mode** (`path: ':memory:'`) — a single in-process database.
  Schemas are not supported.
- **Directory mode** (`path: '<dir>'`) — `path` is treated as a
  directory. The engine creates `<dir>/<name-lowercased>/` and stores
  `main.db` there. Each OQL "schema" becomes a sibling `<name>.db` file
  in that directory, `ATTACH`ed under the schema name. `CREATE_SCHEMA`
  spawns the file (via SQLite's ATTACH-creates-if-missing semantics);
  `DROP_SCHEMA` detaches it and the engine then unlinks the file. On
  connect, every existing `.db` file in the directory is auto-attached,
  so persisted schemas are reachable without re-issuing `CREATE_SCHEMA`.

## API

`SQLiteEngine` extends [`SQLEngine`](../../docs/Drivers-SQLEngine.md) and
inherits its full OQL surface (`execute`, transactions, schema
lifecycle, etc.). SQLite-specific additions:

### `schemaDir`

```typescript ignore
get schemaDir(): string | null
```

Resolved schema directory (`<path>/<name-lowercased>/`) in directory
mode, or `null` in memory mode. Populated on the first connection (first
`execute` / resource creation). Useful for tests and tooling that need
to inspect or clean up the on-disk `.db` files.

## Value encoding

SQLite values are normalized via `_encodeValue`:

| JS                  | SQLite binding |
| ------------------- | -------------- |
| `undefined`         | `null`         |
| `Date`              | ISO string     |
| `boolean`           | `0` or `1`     |
| `Uint8Array`        | BLOB (raw)     |
| object (non-buffer) | JSON string    |
| `string` / `number` | as-is          |

## In-memory caveat

`:memory:` databases are per-handle. Each `:memory:` handle is its own
private in-process database, so two `SQLiteEngine` instances with
`path: ':memory:'` are completely independent — they don't share data.
The single-handle pin keeps one shared handle _within_ a single instance
(which is exactly why `pool.max` is clamped to `1` — a second handle in
`:memory:` mode would silently read from an empty database); it is not
what isolates separate instances.

## Errors

SQLite error codes (`SQLITE_*`) and message text are mapped to standard
`EngineError.code` values. The driver also extracts table / column /
constraint names from SQLite's predictable error messages so the error
meta is fully populated.

## Soak testing

```bash
deno run --allow-all packages/drivers/engines/sqlite/soak.ts
```

[← Back to Drivers](../../README.md)
