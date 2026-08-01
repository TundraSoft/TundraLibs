# Redis Engine

Redis driver speaking RESP3 (with RESP2 fallback) over plain TCP. Built
from scratch on `@tundralibs/compat/net` — no external dependencies,
runs on Deno, Bun, and Node.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Capabilities

- RESP3 negotiation via `HELLO 3` with auth, RESP2 fallback for older
  servers
- Logical database selection (`SELECT N`)
- Strings: `get` / `set` (with `EX`/`PX`/`NX`/`XX`/`KEEPTTL`) /
  `mset` / `mget` / `incr` / `incrBy` / `decr` / `decrBy` / `append` /
  `strlen`
- Keys: `del` / `exists` / `expire` / `pexpire` / `ttl` / `persist` /
  `type` / `rename` / `keys` / `scan`
- Hashes: `hset` / `hget` / `hmget` / `hgetAll` / `hdel` / `hexists` /
  `hlen` / `hkeys` / `hvals` / `hincrBy`
- Lists: `lpush` / `rpush` / `lpop` / `rpop` / `lrange` / `llen`
- Sets: `sadd` / `srem` / `smembers` / `sismember` / `scard`
- Sorted sets: `zadd` / `zrem` / `zrange` / `zscore` / `zcard`
- Server / pub-sub: `info` / `select` / `flushDb` / `flushAll` /
  `dbsize` / `echo` / `publish`
- Transactions: `multi` (see [Transactions](#transactions))
- TLS / SSL support
- Pool integration — each pooled resource is a `RedisConnection`
  wrapping the TCP socket and the receive buffer

## Quick Start

```typescript
import { RedisEngine } from '@tundralibs/drivers/redis';

const redis = new RedisEngine('cache', {
  host: 'localhost',
  port: 6379,
  password: 'secret',
  pool: { min: 1, max: 8 },
});

await redis.set('user:1', JSON.stringify({ name: 'Alice' }), { ex: 60 });
const raw = await redis.get('user:1');

await redis.disconnect();
```

## Exports

`@tundralibs/drivers/redis` exports:

- `RedisEngine` — the engine class.
- `RedisConnection` — the pooled connection wrapping the TCP socket and
  receive buffer (each pool resource is one of these).
- `RedisEngineOptions` (type) — the constructor options shape (see
  [Configuration](#configuration)).

## Configuration

Extends [`EngineOptions`](../../docs/Drivers-BaseEngine.md#configuration).

| Option          | Type                | Default | Notes                                                                                                                                                                                                             |
| --------------- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`          | `string`            | —       | Required.                                                                                                                                                                                                         |
| `port`          | `number`            | `6379`  |                                                                                                                                                                                                                   |
| `username`      | `string`            | —       | Optional. Send only if Redis 6+ ACL is enabled.                                                                                                                                                                   |
| `password`      | `string`            | —       | Optional.                                                                                                                                                                                                         |
| `database`      | `number`            | `0`     | Logical DB index.                                                                                                                                                                                                 |
| `maxBufferSize` | `number`            | `16`    | MiB. A reply larger than this throws `OPERATION_FAILED`; because the frame is left mid-stream, the connection is closed and destroyed (never recycled) so the leftover bytes can't be served to the next command. |
| `ssl`           | `boolean` \| object | —       | `true`/`false` for defaults, or a [`TLSOptions`](../../docs/Drivers-BaseEngine.md#configuration) object plus the engine-only `enforce` field below.                                                               |
| `ssl.enforce`   | `boolean`           | `true`  | When `true`, any TLS failure throws. When `false`, Redis retries the connection in plaintext (cleartext credentials and data) and emits a `notice`.                                                               |

## Connection health

A connection a failed command left unusable is destroyed rather than
returned to the pool: a server _error reply_ leaves the socket in a known
state and the connection is kept, but an I/O or parse failure is not. A
rejected read or write (ECONNRESET, EPIPE, an aborted TLS session), a socket
closed mid-reply, and a reply that overran `maxBufferSize` all mark the
`RedisConnection` closed, so `_validateResource` rejects it and the pool
replaces it — including on paths that release rather than destroy, such as
`ping()`.

## Auth handshake

`HELLO 3 [AUTH user pass]` is tried first. If the server responds with
an error (Redis < 6 doesn't recognize HELLO), the driver falls back to
plain `AUTH` + RESP2. After auth, `SELECT` runs if the engine's current
target database is non-zero (the configured `database`, or whatever a later
`select()` set — so a reconnected/new pooled connection lands on the same
keyspace as the rest of the pool).

## Logical database (`select`)

`select(n)` is **pool-wide**, not per-connection: it switches the connection
it acquires, records `n` as the engine's target database, and every other
pooled connection converges onto `n` the next time it is used (via a
`SELECT` issued before the command). New connections adopt the target during
their handshake. This keeps a multi-connection pool from splitting across
keyspaces — otherwise `select()` would move a single arbitrary connection and
subsequent commands would land on a random database. The sanctioned way to
pin a keyspace up front is still the `database` option.

The engine target only moves once the **server accepts** the index. If the
server rejects it — out of range for its `databases` setting (16 by default),
or cluster mode, which refuses `SELECT` outright — `select()` throws
`OPERATION_FAILED` and the engine stays on the database it was already using;
subsequent commands are unaffected.

## Transactions

`multi(commands)` runs a list of commands atomically inside a
`MULTI` / `EXEC` block on a single pooled connection.

- **Signature:** `multi(commands: ReadonlyArray<ReadonlyArray<string | number>>): Promise<RespValue[]>`
- **Parameters:** `commands` — the commands to queue, each an array of
  parts (e.g. `['SET', 'k', 'v']`).
- **Returns:** the `EXEC` reply array — one entry per queued command.
- **Throws:** `OPERATION_FAILED` if `MULTI`, a queued command, or `EXEC`
  errors (a failed queue triggers `DISCARD`).

```typescript
const replies = await redis.multi([
  ['SET', 'counter', '1'],
  ['INCR', 'counter'],
]);
```

## Errors

Standard `EngineError` codes. The handshake throws `INVALID_AUTH` /
`OPERATION_FAILED` as appropriate.

## Soak testing

```bash
deno run --allow-all packages/drivers/engines/redis/soak.ts
SOAK_DURATION_S=120 deno run --allow-all packages/drivers/engines/redis/soak.ts
```

[← Back to Drivers](../../README.md)
