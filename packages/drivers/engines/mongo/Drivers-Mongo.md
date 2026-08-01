# MongoDB Engine

MongoDB driver wrapping `npm:mongodb`. MongoDB's wire protocol (BSON,
OP_MSG, replica-set discovery, SDAM) is too complex to reimplement from
scratch; the official driver already handles it (and its own pool).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Capabilities

- Wraps the official `mongodb` driver
- BaseEngine pool is **bypassed** — `MongoClient` manages its own pool
  internally; the driver holds exactly one client
- TLS / SSL via `driverOptions.tls`
- Direct access to `client()`, `db()`, `collection()` for full
  driver-native operations
- Native helper methods: `insertOne`, `insertMany`, `findOne`, `find`,
  `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `countDocuments`,
  `aggregate`
- Full OQL query surface (`select`, `insert`, `update`, `delete`,
  `upsert`, `count`, `createTable`, …) — the same API the SQL engines
  expose, translated to Mongo operations

## Quick Start

```typescript
import { MongoEngine } from '@tundralibs/drivers/mongo';

const m = new MongoEngine('app', {
  host: 'localhost',
  port: 27017,
  username: 'mongo',
  password: '...',
  database: 'myapp',
});

await m.insertOne('users', { _id: 1, name: 'Alice' });
const user = await m.findOne('users', { _id: 1 });

await m.disconnect();
```

## Configuration

Extends [`EngineOptions`](../../docs/Drivers-BaseEngine.md#configuration).

| Option          | Type     | Default                       | Notes                                                                                                                                                                       |
| --------------- | -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`          | `string` | —                             | One of `host` or `uri` is required. Must be a bare hostname, IPv4, or bracketed IPv6 address — `mongodb+srv://` and multi-host (replica-set) forms are rejected; use `uri`. |
| `port`          | `number` | `27017`                       |                                                                                                                                                                             |
| `database`      | `string` | —                             | Default DB for `db()` / `collection()` calls.                                                                                                                               |
| `username`      | `string` | —                             | Optional.                                                                                                                                                                   |
| `password`      | `string` | —                             | Optional.                                                                                                                                                                   |
| `replicaSet`    | `string` | —                             | Replica set name. Built into the connection URI query string (`?replicaSet=...`) when `host` is used.                                                                       |
| `authSource`    | `string` | `admin` (when `username` set) | Authentication database. Added to the URI query string (`?authSource=...`) when `host` is used.                                                                             |
| `uri`           | `string` | —                             | Full connection string (`mongodb://...` or `mongodb+srv://...`). When set, takes precedence over all host fields.                                                           |
| `driverOptions` | object   | —                             | Pass-through to `MongoClient.connect()` (e.g. `tls`, `maxPoolSize`).                                                                                                        |

## Pool

Configure connection-pool size via `driverOptions.maxPoolSize` —
not `pool.max`. The driver's `BaseEngine.pool` is bypassed and the
`pool` option is ignored for Mongo.

`connect()` is idempotent and concurrency-safe: a fan-out of first
operations at startup (e.g. `Promise.all([m.findOne(...), m.insertOne(...)])`
on a cold engine) all join the single in-flight connect rather than racing
it, so none of them fail with a spurious `NO_CONNECTION`.

## Direct driver access

```typescript
const client = await m.client(); // raw MongoClient
const db = await m.db('analytics'); // raw Db
const col = await m.collection('logs'); // raw Collection
```

## Native helpers

Convenience wrappers over the driver's collection API. Each
auto-connects on first use.

- `insertOne(collection, document)` — insert one document; returns the
  inserted id.
- `insertMany(collection, documents)` — insert many documents; returns
  the array of inserted ids.
- `findOne(collection, filter?)` — find one document; returns `null`
  when nothing matches.
- `find(collection, filter?, opts?)` — find documents. `opts` forwards
  `limit` / `skip` / `sort` / `projection` to the cursor.
- `updateOne(collection, filter, update, opts?)` /
  `updateMany(collection, filter, update)` — return the **matched** count
  (`matchedCount`; `updateOne` adds `upsertedCount`), NOT Mongo's
  `modifiedCount`. This mirrors SQL affected-rows semantics — a filter that
  matches a row whose values already equal the update reports it as affected.
- `deleteOne(collection, filter)` / `deleteMany(collection, filter)` —
  return the deleted count.
- `countDocuments(collection, filter?)` — return the matching count.
- `aggregate(collection, pipeline)` — run an aggregation pipeline;
  returns the resulting documents as an array.

## OQL query surface

The engine exposes the same OQL query methods as the SQL engines.
Each takes a typed `Query<...>` object, runs it through the Mongo
translator, and returns the uniform `EngineQueryResult` (`{ id, query,
data, count, time, isSlow }`) — or an array of results for the
multi-statement DDL methods.

- Data: `select`, `insert`, `insertQuery`, `update`, `delete`,
  `upsert`, `count`
- Schema / DDL: `createTable`, `alterTable`, `dropTable`, `truncate`,
  `createIndex`, `dropIndex`, `createView`, `dropView`, `alterView`,
  `refreshMaterializedView`, `createSchema`, `dropSchema`

The translator automatically picks `find` vs `aggregate` for `select`,
and emits `createCollection` + index creates for `createTable` (Mongo
collections are schemaless).

### `count()` result shape

`count()` mirrors the SQL engines: the value lives in a single result
row, not in the outer `count` field. The count is at
`result.data[0].Count`, and `result.count` is always `1` (the number
of rows in `data`).

```typescript
const result = await m.count(query);
const n = result.data[0].Count; // the COUNT value
// result.count === 1            // always — it's the row count of `data`
```

## Errors

The constructor throws `MISSING_CONFIG_VALUE` when neither `host` nor
`uri` is supplied. On connect, building the connection URI throws
`INVALID_CONFIG_VALUE` if `host` is not a bare hostname, IPv4, or
bracketed IPv6 address (e.g. a `mongodb+srv://` value or a multi-host
replica-set string) — use the `uri` option for those forms.

MongoDB error codes are mapped to standard `EngineError.code` values
where possible; uncategorized errors come through as
`OPERATION_FAILED`.

[← Back to Drivers](../../README.md)
