# BaseEngine

Abstract base class for every driver engine. Owns connection lifecycle,
inline pool, SSL loading, and lifecycle events.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Quick Start (subclassing)](#quick-start-subclassing)
- [Configuration](#configuration)
- [Lifecycle](#lifecycle)
- [Pool semantics](#pool-semantics)
- [Hooks for subclasses](#hooks-for-subclasses)
- [Events](#events)
- [Errors](#errors)

## Overview

`BaseEngine` is abstract — concrete drivers (`PostgresEngine`,
`RedisEngine`, …) extend it. The base supplies:

- A connection state machine (`CLOSED → CONNECTING → READY → CLOSED`)
- An inline connection pool with min/max, idle eviction, acquire timeout
- SSL/TLS option processing (PEM strings or file paths)
- Lifecycle events (`connect`, `disconnect`, `connectionFailed`, `error`,
  `warn`, `notice`)
- Statistics (`poolStats`)
- An `instanceId` of the form `"<Engine>::<Name>"`

The engine composes an internal `ConnectionPool<T>` — created and owned as
`this._pool`, not part of the public API, so you never construct or pass a
`Pool` object yourself. With no `pool` option configured, the engine runs in
single-connection mode (one warm connection, no idle eviction, queueing is
still in place). Configure `pool: { min, max, ... }` for multi-connection.

### Where to import the bases from

The abstract bases ship on their own sub-path, `@tundralibs/drivers/base`,
alongside the types you need to declare an engine. Import them from there
rather than from the package root: the root barrel re-exports every concrete
engine, including the native `SQLiteEngine` whose adapter loads a per-runtime
binding (`bun:sqlite`, `jsr:@db/sqlite`, `better-sqlite3`), and those
specifiers will break a bundle aimed at an edge or browser runtime.
`@tundralibs/drivers/base` reaches no concrete engine at all.

```typescript
import {
  BaseEngine, // = PooledConnectionEngine — pooled, generic
  ConnectionEngine, // pool-free, generic
  PooledConnectionEngine,
  SQLConnectionEngine, // pool-free, SQL surface
  SQLEngine, // pooled, SQL surface
} from '@tundralibs/drivers/base';
```

## Quick Start (subclassing)

```typescript
import { BaseEngine } from '@tundralibs/drivers/base';
import { EngineError } from '@tundralibs/drivers/errors';
import type {
  EngineCapabilities,
  EngineEvents,
  EngineOptions,
} from '@tundralibs/drivers/types';
import type { EventOptionKeys } from '@tundralibs/utils';

// Whatever your protocol client looks like.
type MyConnection = {
  closed: boolean;
  send(command: string): Promise<string>;
  close(): Promise<void>;
};
declare function connectToServer(
  host: string,
  port: number,
): Promise<MyConnection>;

type MyOptions = EngineOptions & {
  host: string;
  port?: number;
};

class MyEngine extends BaseEngine<MyConnection, MyOptions> {
  public readonly Engine = 'MYDB';
  public readonly Capabilities: EngineCapabilities = {
    pooledConnections: true,
    transactions: false,
    preparedStatements: false,
  };

  constructor(
    name: string,
    options: EventOptionKeys<MyOptions, EngineEvents>,
  ) {
    super(name, options, { port: 1234 });
    if (this.hasOption('host') === false) {
      throw new EngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'host',
      });
    }
  }

  protected async _createResource(): Promise<MyConnection> {
    return await connectToServer(
      this._getOption('host')!,
      this._getOption('port')!,
    );
  }

  protected async _destroyResource(c: MyConnection): Promise<void> {
    await c.close();
  }

  protected override _validateResource(c: MyConnection): boolean {
    return !c.closed;
  }

  protected async _ping(c: MyConnection): Promise<boolean> {
    try {
      await c.send('PING');
      return true;
    } catch {
      return false;
    }
  }

  // Public methods use the inline pool helpers.
  public async hello(): Promise<string> {
    if (this._status !== 'READY') await this.connect();
    const c = await this._acquire();
    try {
      return await c.send('HELLO');
    } finally {
      this._release(c);
    }
  }
}
```

## Configuration

`EngineOptions` is the base option shape. Subclass option types extend it.

| Option        | Type                                                                                   | Default             | Notes                                                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`        | `string`                                                                               | —                   | Optional at the base level; subclasses enforce.                                                                                                                                                                               |
| `port`        | `number`                                                                               | —                   | Integer 1..65535.                                                                                                                                                                                                             |
| `username`    | `string`                                                                               | —                   | Optional.                                                                                                                                                                                                                     |
| `password`    | `string`                                                                               | —                   | Optional.                                                                                                                                                                                                                     |
| `database`    | `string \| number`                                                                     | —                   | Most engines use string DB name; Redis uses numeric index.                                                                                                                                                                    |
| `pool`        | `{ min, max, idleTimeoutSeconds, acquireTimeoutSeconds }`                              | unset → single-conn | See [Pool semantics](#pool-semantics).                                                                                                                                                                                        |
| `ssl`         | `boolean \| { ca, cert, key, certFile, keyFile, caFile, rejectUnauthorized, enforce }` | —                   | `compat` `TLSOptions` plus engine-only `enforce` (default `true`). Inline PEM via `cert`/`key`/`ca` (`ca` is `string[]`) or paths via `certFile`/`keyFile`/`caFile`. `enforce: false` falls back to plaintext on TLS failure. |
| `idGenerator` | `(prefix?: string) => string`                                                          | ULID with prefix    | Used for query / transaction ids.                                                                                                                                                                                             |

## Lifecycle

State machine: `CLOSED → CONNECTING → READY → CLOSED`. There is no
`WAITING` state — pool saturation is reflected in `poolStats.waiting`.

| Method         | Behavior                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`    | Idempotent. Creates `min` warm connections in parallel via `_ensureMin`. Fires `connect` on success, `connectionFailed` on error. |
| `disconnect()` | Idempotent. Drains the pool: rejects pending waiters, destroys idle resources, lets active resources self-destroy on `_release`.  |
| `ping()`       | Returns `false` (rather than throws) when the engine is `CLOSED` or the underlying ping fails. Acquires/releases internally.      |
| `status`       | Read-only getter.                                                                                                                 |
| `poolStats`    | `{ total, active, idle, waiting }` snapshot.                                                                                      |

## Pool semantics

The pool lives inline on the engine. Two modes:

**Single-connection (default — no `pool` option):**

- `min: 1, max: 1, idleTimeoutMs: 0` (no eviction)
- One warm connection, queue waits forever (or until `acquireTimeoutMs`)
- Right when sitting behind PgBouncer / pgcat / RDS Proxy — no
  pool-on-pool.

**Multi-connection (with `pool` option):**

- `pool.min` warm connections kept; `pool.max` cap; idle ones evicted
  after `pool.idleTimeoutSeconds` (won't drop below min)
- New `_acquire` calls past `max` queue with `pool.acquireTimeoutSeconds`
- Validates each idle resource via `_validateResource` before handing
  it back; on failure, destroys and tries the next idle
- A freed connection handed **directly to a queued waiter** is validated
  the same way — a connection that died while checked out is destroyed and
  the waiter is given a freshly created one, never the corpse
- `pool.max` is never exceeded, including while a freed connection is
  mid-validation on its way to a waiter: it stays counted against the cap
  for that whole window, so a concurrent `_acquire` queues instead of
  opening a surplus connection
- Destroying a connection (`_destroy`, or a failed validation) frees a
  pool slot, so a queued waiter is backfilled with a new connection rather
  than left to time out

```typescript
import type { EngineOptions } from '@tundralibs/drivers/types';

// The engine from Quick Start above.
declare class MyEngine {
  constructor(name: string, options: EngineOptions & { host: string });
}

const single = new MyEngine('one', { host: '...' }); // 1 conn
const pooled = new MyEngine('many', {
  host: '...',
  pool: { min: 2, max: 10, idleTimeoutSeconds: 60 },
});
```

## Hooks for subclasses

| Hook                | Required | Default | Purpose                                                                                                        |
| ------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `_createResource`   | yes      | —       | Open and return one fresh connection. Called by `_acquire` / `_ensureMin`.                                     |
| `_destroyResource`  | yes      | —       | Close one connection. Called by `_release`/`_destroy`/`_drain`. Errors are swallowed.                          |
| `_ping`             | yes      | —       | Liveness check on a given resource.                                                                            |
| `_validateResource` | no       | `true`  | Health check before an idle resource is reused **or handed to a waiter**. Return `false` to destroy + replace. |

Inside subclass methods, use the protected pool helpers:

| Helper                 | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `_acquire(timeoutMs?)` | Get a connection (queue if pool saturated).            |
| `_release(resource)`   | Return a connection to the pool (or hand to a waiter). |
| `_destroy(resource)`   | Force-destroy a broken connection (don't return).      |

## Events

Subscribe via `engine.on('eventName', handler)` or supply via the
`_on<event>` option key at construction.

| Event              | Payload                 | When                                                                                                                                                                           |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connect`          | `(instanceId)`          | After `connect()` succeeds.                                                                                                                                                    |
| `disconnect`       | `(instanceId)`          | After `disconnect()` succeeds.                                                                                                                                                 |
| `connectionFailed` | `(instanceId, error)`   | When `connect()` fails. Handler type is `Error`; always an `EngineError` instance at runtime.                                                                                  |
| `error`            | `(instanceId, error)`   | When `disconnect()` fails. Handler type is `Error`; always an `EngineError` instance at runtime.                                                                               |
| `warn`             | `(instanceId, message)` | Misc warnings — "we noticed something off".                                                                                                                                    |
| `notice`           | `(instanceId, message)` | Server-side notice / informational message (Postgres `NOTICE`, MariaDB warning, Redis/Memcached TLS-downgrade notices). Distinct from `warn` — "the server told us something". |

```typescript
import type { EngineError } from '@tundralibs/drivers/errors';
import type { EngineEvents, EngineOptions } from '@tundralibs/drivers/types';
import type { EventOptionKeys } from '@tundralibs/utils';

// The engine from Quick Start above.
declare class MyEngine {
  constructor(
    name: string,
    options: EventOptionKeys<EngineOptions & { host: string }, EngineEvents>,
  );
}

const engine = new MyEngine('app', {
  host: '...',
  _onconnect: (id) => console.log('connected', id),
  // Handler type is `Error`; always an `EngineError` at runtime.
  _onconnectionFailed: (id, err) =>
    console.error(id, (err as EngineError).code, err.message),
});
```

## Errors

`EngineError` is the only error class drivers throw. Code is one of the
values in `EngineErrorCodes`. See
[Drivers.md → Standardized SQL error codes](../README.md#standardized-error-codes)
for the SQL-engine-specific subset.

```typescript
import { EngineError } from '@tundralibs/drivers/errors';
import { MemcachedEngine } from '@tundralibs/drivers/memcached';

const engine = new MemcachedEngine('app-cache', { host: 'localhost' });

try {
  await engine.connect();
} catch (e) {
  if (e instanceof EngineError && e.code === 'CONNECTION_FAILED') {
    // ...
  }
}
```

[← Back to Drivers](../README.md)
