# Error Handling

Comprehensive error handling for all driver engines.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Error Classes](#error-classes)
- [Error Codes](#error-codes)
  - [Code Reference](#code-reference)
  - [Branching on a Code](#branching-on-a-code)
  - [Configuration Errors](#configuration-errors)
  - [Connection Lifecycle Errors](#connection-lifecycle-errors)
  - [Pool Errors](#pool-errors)
  - [Operation Errors](#operation-errors)
  - [Authentication Errors](#authentication-errors)
  - [Query Errors](#query-errors)
  - [Schema Errors](#schema-errors)
  - [Constraint Violations](#constraint-violations)
  - [Concurrency Errors](#concurrency-errors)
  - [Transaction Errors](#transaction-errors)
- [Error Handling Patterns](#error-handling-patterns)
- [Examples](#examples)

## Overview

The drivers package provides a comprehensive error system with:

- **Standardized error codes** across all database engines
- **Hierarchical error classes** for type-safe error handling
- **Structured metadata** with variable substitution
- **Cause chain preservation** for debugging
- **Cross-runtime compatibility** (Bun, Deno, Node.js)

All database-specific errors are mapped to standardized codes, enabling consistent error handling regardless of the underlying database system.

## Error Classes

### DriverError

Base error class for the drivers package.

```typescript ignore
import { DriverError } from '@tundralibs/drivers/errors';

class DriverError<M extends Record<string, unknown>> extends BaseError<M> {
  constructor(message: string, meta: M, cause?: Error);
}
```

**Properties:**

- `message` - Error message
- `context` - Metadata object
- `cause` - Optional underlying error
- `timeStamp` - Error creation timestamp
- `stack` - Stack trace

### EngineError

Error thrown by `BaseEngine` and its subclasses for connection-lifecycle and engine-level failures.

```typescript ignore
import { EngineError } from '@tundralibs/drivers/errors';

class EngineError<M extends EngineErrorMeta> extends DriverError<M> {
  readonly code: EngineErrorCode;
  readonly engine: string;
  readonly connectionName: string;

  constructor(code: EngineErrorCode, meta: M, cause?: Error);
}
```

**Properties:**

- `code` - Standardized error code (e.g., 'CONNECTION_FAILED')
- `engine` - Engine type (e.g., 'PostgresEngine')
- `connectionName` - Connection identifier
- `context` - Error-specific metadata (e.g., `{ instanceId, timeoutMs }`)

**Metadata:**

All `EngineError` instances include:

- `instanceId` - Formatted as `"<Engine>::<Name>"`
- Error-specific variables (e.g., `operation`, `reason`, `timeoutMs`)

### EngineErrorCode

Union of the **30** standardized error-code strings accepted by the `EngineError` constructor and exposed on `EngineError.code`. Every one of them is listed in the [Code Reference](#code-reference) below.

```typescript ignore
import type { EngineErrorCode } from '@tundralibs/drivers/errors';

type EngineErrorCode =
  | 'UNKNOWN_ERROR'
  | 'INVALID_CONFIG_VALUE'
  | 'MISSING_CONFIG_VALUE'
  | 'CONNECTION_FAILED'
  | 'DISCONNECTION_FAILED'
  | 'NO_CONNECTION'
  | 'CONNECTION_LOST'
  | 'POOL_DRAINING'
  | 'POOL_ACQUIRE_TIMEOUT'
  | 'POOL_RESOURCE_FAILED'
  | 'OPERATION_FAILED'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_AUTH'
  | 'PERMISSION_DENIED'
  | 'MISSING_PARAMETERS'
  | 'QUERY_EXECUTION_FAILED'
  | 'QUERY_TIMEOUT'
  | 'SYNTAX_ERROR'
  | 'DATABASE_NOT_FOUND'
  | 'TABLE_NOT_FOUND'
  | 'COLUMN_NOT_FOUND'
  | 'DUPLICATE_KEY'
  | 'FOREIGN_KEY_VIOLATION'
  | 'NOT_NULL_VIOLATION'
  | 'CHECK_VIOLATION'
  | 'DEADLOCK'
  | 'LOCK_TIMEOUT'
  | 'SERIALIZATION_FAILURE'
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSACTION_OPERATION_ERROR';
```

Each code is documented under [Error Codes](#error-codes) below.

### EngineErrorMeta

Metadata shape carried by every `EngineError`. Each error code populates the variables its template requires (see per-code **Metadata** sections below).

```typescript
import type { EngineErrorMeta } from '@tundralibs/drivers/errors';
```

### EngineErrorCodes

Runtime constant mapping each `EngineErrorCode` to its message template. Templates use `${var}` placeholders filled from error metadata when the message is built.

```typescript
import { EngineErrorCodes } from '@tundralibs/drivers/errors';

// Look up the raw template for a code
EngineErrorCodes['CONNECTION_FAILED'];
// => 'Failed to connect to ${instanceId}'
```

**Type:** `Record<EngineErrorCode, string>`

## Error Codes

### Code Reference

All **30** codes in `EngineErrorCode`, grouped the way `EngineErrorCodes.ts` groups them. Every `EngineError` carries `instanceId` (`"<Engine>::<Name>"`); the **Metadata** column lists the _additional_ variables that code's message template consumes. Each code links to its detail section below.

| Code                                                          | Group         | Raised when                                                                                                                                                  | Metadata                     |
| ------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| [`INVALID_CONFIG_VALUE`](#invalid_config_value)               | Configuration | An option failed validation — raised eagerly at construction, before any connection is attempted.                                                            | `option`, `reason`           |
| [`MISSING_CONFIG_VALUE`](#missing_config_value)               | Configuration | A required option was not supplied.                                                                                                                          | `option`                     |
| [`CONNECTION_FAILED`](#connection_failed)                     | Connection    | `connect()` could not establish a connection — bad host/port, network failure, or the server is down.                                                        | —                            |
| [`DISCONNECTION_FAILED`](#disconnection_failed)               | Connection    | `disconnect()` could not close cleanly.                                                                                                                      | —                            |
| [`NO_CONNECTION`](#no_connection)                             | Connection    | An operation ran with no active connection. Call `connect()` first.                                                                                          | —                            |
| [`CONNECTION_LOST`](#connection_lost)                         | Connection    | An established connection dropped mid-flight — also mapped from Postgres `08xxx` / `57Pxx` SQLSTATEs.                                                        | `reason`                     |
| [`POOL_DRAINING`](#pool_draining)                             | Pool          | A connection was requested while the pool is shutting down (during `disconnect()`).                                                                          | —                            |
| [`POOL_ACQUIRE_TIMEOUT`](#pool_acquire_timeout)               | Pool          | The wait for a free pooled connection exceeded `acquireTimeoutSeconds`.                                                                                      | `timeoutMs`                  |
| [`POOL_RESOURCE_FAILED`](#pool_resource_failed)               | Pool          | Reserved for a failure to create a new pool resource. **No throw site raises it today** — the pool reports that as `CONNECTION_FAILED`.                      | —                            |
| [`OPERATION_FAILED`](#operation_failed)                       | Operation     | Catch-all for a named engine operation that failed (cache `get`/`set`/`delete`, Mongo commands, HTTP round-trips).                                           | `operation`, `reason`        |
| [`UNSUPPORTED_OPERATION`](#unsupported_operation)             | Operation     | The engine has no implementation for the operation — e.g. transactions on the fetch-only HTTP engines.                                                       | `operation`                  |
| [`INVALID_AUTH`](#invalid_auth)                               | Auth          | Credentials were rejected — Postgres auth handshake, Redis `AUTH`, or SQLSTATE `28000` / `28P01`.                                                            | `reason`                     |
| [`PERMISSION_DENIED`](#permission_denied)                     | Auth          | Authenticated, but not authorized — SQLSTATE `42501`, SQLite `SQLITE_READONLY`, Redis `NOPERM`, or Mongo `Unauthorized`.                                     | `reason`                     |
| [`MISSING_PARAMETERS`](#missing_parameters)                   | Query         | The SQL names `:param:` placeholders that `params` does not supply. Raised before the query is sent.                                                         | `missing`                    |
| [`QUERY_EXECUTION_FAILED`](#query_execution_failed)           | Query         | The server rejected the statement for a reason with no more specific code. The default for unmapped SQLSTATEs.                                               | `reason`                     |
| [`QUERY_TIMEOUT`](#query_timeout)                             | Query         | The statement exceeded the engine's configured timeout — Postgres `57014`, MariaDB `ER_QUERY_TIMEOUT`.                                                       | `timeoutMs`                  |
| [`SYNTAX_ERROR`](#syntax_error)                               | Query         | The statement did not parse — SQLSTATE `42601`, or a SQLite `syntax error`.                                                                                  | `reason`                     |
| [`DATABASE_NOT_FOUND`](#database_not_found)                   | Schema        | The named database/catalog does not exist — SQLSTATE `3D000`, MariaDB `ER_BAD_DB_ERROR`.                                                                     | `database`                   |
| [`TABLE_NOT_FOUND`](#table_not_found)                         | Schema        | The referenced table does not exist — SQLSTATE `42P01`, or SQLite `no such table`.                                                                           | `table`                      |
| [`COLUMN_NOT_FOUND`](#column_not_found)                       | Schema        | The referenced column does not exist — SQLSTATE `42703`, or SQLite `no such column`.                                                                         | `column`                     |
| [`DUPLICATE_KEY`](#duplicate_key)                             | Constraint    | A UNIQUE or PRIMARY KEY constraint was violated — SQLSTATE `23505`, MariaDB `ER_DUP_ENTRY`, SQLite `SQLITE_CONSTRAINT_UNIQUE`, Mongo `DuplicateKey` (11000). | `constraint`                 |
| [`FOREIGN_KEY_VIOLATION`](#foreign_key_violation)             | Constraint    | A FOREIGN KEY constraint was violated — SQLSTATE `23503`.                                                                                                    | `constraint`                 |
| [`NOT_NULL_VIOLATION`](#not_null_violation)                   | Constraint    | A NOT NULL column received `NULL` — SQLSTATE `23502`.                                                                                                        | `column`                     |
| [`CHECK_VIOLATION`](#check_violation)                         | Constraint    | A CHECK constraint rejected the value — SQLSTATE `23514`.                                                                                                    | `constraint`                 |
| [`DEADLOCK`](#deadlock)                                       | Concurrency   | The server broke a deadlock and chose this transaction as the victim — SQLSTATE `40P01`. **Retry it.**                                                       | —                            |
| [`LOCK_TIMEOUT`](#lock_timeout)                               | Concurrency   | Waiting on a row/table lock timed out — SQLSTATE `55P03`, MariaDB `ER_LOCK_WAIT_TIMEOUT`.                                                                    | —                            |
| [`SERIALIZATION_FAILURE`](#serialization_failure)             | Concurrency   | An MVCC conflict under `SERIALIZABLE` — SQLSTATE `40001`. **Retry it.**                                                                                      | —                            |
| [`TRANSACTION_NOT_FOUND`](#transaction_not_found)             | Transaction   | A `transactionId` was passed that the engine does not know — usually already committed or rolled back.                                                       | `transactionId`              |
| [`TRANSACTION_OPERATION_ERROR`](#transaction_operation_error) | Transaction   | `begin` / `commit` / `rollback` itself failed.                                                                                                               | `operation`, `transactionId` |
| [`UNKNOWN_ERROR`](#unknown_error)                             | Fallback      | The `EngineError` constructor received a code that is not in `EngineErrorCodes`. It coerces to this and preserves the original.                              | `reason`, `originalCode`     |

Which codes you can actually see depends on the engine. The Postgres SQLSTATE map is shared verbatim with the Neon HTTP engine, so those two cover the widest range. SQLite's mapper — used by the native, Turso, and D1 engines — matches on the driver's error code and message text instead, and covers a narrower set: it never produces `DEADLOCK`, `LOCK_TIMEOUT`, `QUERY_TIMEOUT`, `SERIALIZATION_FAILURE`, `DATABASE_NOT_FOUND`, or `INVALID_AUTH`. Anything a mapper does not recognise becomes `QUERY_EXECUTION_FAILED` with the driver's own message on `reason` and the original error on `cause`.

### Branching on a Code

`err.code` is the stable discriminator. Group the codes by the reaction they deserve rather than handling all 30 individually:

```typescript
import { EngineError } from '@tundralibs/drivers/errors';
import type { EngineErrorCode } from '@tundralibs/drivers/errors';

/** Transient — the same call may succeed if you try it again. */
const RETRYABLE: ReadonlySet<EngineErrorCode> = new Set([
  'DEADLOCK',
  'SERIALIZATION_FAILURE',
  'LOCK_TIMEOUT',
  'POOL_ACQUIRE_TIMEOUT',
  'CONNECTION_LOST',
]);

/** Deployment/config problems — retrying will never help. */
const FATAL: ReadonlySet<EngineErrorCode> = new Set([
  'INVALID_CONFIG_VALUE',
  'MISSING_CONFIG_VALUE',
  'INVALID_AUTH',
  'PERMISSION_DENIED',
  'DATABASE_NOT_FOUND',
  'TABLE_NOT_FOUND',
  'COLUMN_NOT_FOUND',
  'SYNTAX_ERROR',
  'UNSUPPORTED_OPERATION',
]);

export type Verdict = 'retry' | 'fatal' | 'conflict' | 'other' | 'not-ours';

export function classify(err: unknown): Verdict {
  if (!(err instanceof EngineError)) return 'not-ours';
  if (RETRYABLE.has(err.code)) return 'retry';
  if (FATAL.has(err.code)) return 'fatal';
  switch (err.code) {
    case 'DUPLICATE_KEY':
    case 'FOREIGN_KEY_VIOLATION':
    case 'NOT_NULL_VIOLATION':
    case 'CHECK_VIOLATION':
      // A constraint spoke: this is data, not infrastructure. Surface it
      // to the caller (`err.context.constraint` names the constraint).
      return 'conflict';
    default:
      return 'other';
  }
}
```

### Configuration Errors

#### INVALID_CONFIG_VALUE

Configuration value is invalid or malformed.

**Template:** `Configuration value for "${option}" is invalid - ${reason}`

**Metadata:**

- `option` - Configuration option name
- `reason` - Why the value is invalid

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

try {
  const engine = new PostgresEngine('db', {
    pool: { max: -5 }, // Invalid value
  });
} catch (err) {
  if (err instanceof EngineError && err.code === 'INVALID_CONFIG_VALUE') {
    console.error(`Invalid ${err.context.option}: ${err.context.reason}`);
  }
}
```

#### MISSING_CONFIG_VALUE

Required configuration value is not provided.

**Template:** `Required configuration value "${option}" is missing`

**Metadata:**

- `option` - Missing configuration option name

### Connection Lifecycle Errors

#### CONNECTION_FAILED

Failed to establish connection to the database.

**Template:** `Failed to connect to ${instanceId}`

**Metadata:**

- `instanceId` - Engine instance identifier

**Common Causes:**

- Invalid host/port
- Network unreachable
- Database not running
- Authentication failure (may also throw `INVALID_AUTH`)

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

try {
  await engine.connect();
} catch (err) {
  if (err instanceof EngineError && err.code === 'CONNECTION_FAILED') {
    console.error(`Cannot connect to ${err.engine}::${err.connectionName}`);
    console.error('Cause:', (err.cause as Error | undefined)?.message);
  }
}
```

#### DISCONNECTION_FAILED

Failed to cleanly disconnect from the database.

**Template:** `Failed to disconnect from ${instanceId}`

**Metadata:**

- `instanceId` - Engine instance identifier

#### NO_CONNECTION

Attempted operation without an active connection.

**Template:** `No connection available for ${instanceId}`

**Metadata:**

- `instanceId` - Engine instance identifier

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

try {
  await engine.execute({ sql: 'SELECT 1' });
} catch (err) {
  if (err instanceof EngineError && err.code === 'NO_CONNECTION') {
    await engine.connect();
    await engine.execute({ sql: 'SELECT 1' });
  }
}
```

#### CONNECTION_LOST

Active connection was unexpectedly lost.

**Template:** `Connection to ${instanceId} was lost: ${reason}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `reason` - Reason for connection loss

### Pool Errors

#### POOL_DRAINING

Attempted to acquire connection while pool is draining.

**Template:** `Pool for ${instanceId} is draining; new acquires are not permitted`

**Metadata:**

- `instanceId` - Engine instance identifier

**Context:**

Thrown when trying to acquire a connection during `disconnect()` or when the pool is shutting down.

#### POOL_ACQUIRE_TIMEOUT

Timed out waiting for available connection from pool.

**Template:** `Acquiring a connection from ${instanceId} timed out after ${timeoutMs}ms`

**Metadata:**

- `instanceId` - Engine instance identifier
- `timeoutMs` - Configured acquire timeout

**Common Causes:**

- Pool exhausted (all connections in use)
- Slow queries holding connections
- Pool size too small for load

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', {
  host: 'localhost',
  database: 'myapp',
  username: 'appuser',
  pool: {
    max: 5,
    acquireTimeoutSeconds: 30,
  },
});

try {
  // Running more concurrent queries than the pool's `max` makes later
  // acquires wait; past `acquireTimeoutSeconds` they reject.
  await Promise.all(
    Array.from(
      { length: 100 },
      () => engine.execute({ sql: 'SELECT pg_sleep(60)' }),
    ),
  );
} catch (err) {
  if (err instanceof EngineError && err.code === 'POOL_ACQUIRE_TIMEOUT') {
    console.error(`Pool exhausted after ${err.context.timeoutMs}ms`);
    // Consider increasing pool size or optimizing queries
  }
}
```

#### POOL_RESOURCE_FAILED

Reserved for a failure to create a new connection for the pool.

**Template:** `Failed to create a new pool resource for ${instanceId}`

**Metadata:**

- `instanceId` - Engine instance identifier

> **Not currently thrown.** No code path in the package raises this code. When the pool fails to create a resource for a queued waiter, it rejects that waiter with the underlying `EngineError` if there is one, and otherwise wraps the cause in a `CONNECTION_FAILED`. The code stays in the union for compatibility — do not write a handler that waits for it.

### Operation Errors

#### OPERATION_FAILED

Generic operation failure.

**Template:** `Operation "${operation}" failed on ${instanceId}: ${reason}`

**Metadata:**

- `operation` - Operation name
- `instanceId` - Engine instance identifier
- `reason` - Failure reason

**Example:**

```typescript
import { MemcachedEngine } from '@tundralibs/drivers/memcached';
import { EngineError } from '@tundralibs/drivers/errors';

const cacheEngine = new MemcachedEngine('cache', { host: 'localhost' });

try {
  await cacheEngine.delete('key');
} catch (err) {
  if (err instanceof EngineError && err.code === 'OPERATION_FAILED') {
    console.error(`Failed ${err.context.operation}: ${err.context.reason}`);
  }
}
```

#### UNSUPPORTED_OPERATION

Operation is not supported by this engine.

**Template:** `Operation "${operation}" is not supported by ${instanceId}`

**Metadata:**

- `operation` - Unsupported operation name
- `instanceId` - Engine instance identifier

### Authentication Errors

#### INVALID_AUTH

Authentication credentials are invalid.

**Template:** `Authentication failed for ${instanceId}: ${reason}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `reason` - Authentication failure reason

**Common Causes:**

- Wrong username/password
- Expired credentials
- Account disabled
- Authentication method mismatch

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

try {
  await engine.connect();
} catch (err) {
  if (err instanceof EngineError && err.code === 'INVALID_AUTH') {
    console.error('Authentication failed - check credentials');
  }
}
```

#### PERMISSION_DENIED

User lacks required permissions for operation.

**Template:** `Permission denied on ${instanceId}: ${reason}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `reason` - Permission denial reason

### Query Errors

#### MISSING_PARAMETERS

Required query parameters not provided.

**Template:** `Required parameters not provided for query on ${instanceId}: ${missing}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `missing` - Comma-separated list of missing parameter names

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

try {
  await engine.execute({
    sql: 'SELECT * FROM users WHERE id = :userId:',
    params: {}, // Missing userId parameter
  });
} catch (err) {
  if (err instanceof EngineError && err.code === 'MISSING_PARAMETERS') {
    console.error(`Missing params: ${err.context.missing}`);
  }
}
```

#### QUERY_EXECUTION_FAILED

Query execution encountered an error.

**Template:** `Query execution failed on ${instanceId}: ${reason}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `reason` - Execution failure reason

**Common Causes:**

- Runtime errors (division by zero, overflow)
- Invalid function arguments
- Data type mismatches
- Constraint violations (see specific codes)

#### QUERY_TIMEOUT

Query exceeded configured timeout.

**Template:** `Query timed out on ${instanceId} after ${timeoutMs}ms`

**Metadata:**

- `instanceId` - Engine instance identifier
- `timeoutMs` - Configured query timeout

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

// A query timeout is configured on the engine (e.g. Postgres'
// `statementTimeoutMs`), not passed per call.
try {
  await engine.execute({ sql: 'SELECT * FROM huge_table' });
} catch (err) {
  if (err instanceof EngineError && err.code === 'QUERY_TIMEOUT') {
    console.warn(`Query exceeded ${err.context.timeoutMs}ms timeout`);
  }
}
```

#### SYNTAX_ERROR

SQL syntax is invalid.

**Template:** `SQL syntax error on ${instanceId}: ${reason}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `reason` - Syntax error details

### Schema Errors

#### DATABASE_NOT_FOUND

Referenced database does not exist.

**Template:** `Database not found on ${instanceId}: ${database}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `database` - Database name

#### TABLE_NOT_FOUND

Referenced table does not exist.

**Template:** `Table not found on ${instanceId}: ${table}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `table` - Table name

#### COLUMN_NOT_FOUND

Referenced column does not exist.

**Template:** `Column not found on ${instanceId}: ${column}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `column` - Column name

### Constraint Violations

#### DUPLICATE_KEY

Unique constraint or primary key violation.

**Template:** `Duplicate key violation on ${instanceId}: ${constraint}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `constraint` - Constraint name

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

try {
  await engine.execute({
    sql: 'INSERT INTO users (email) VALUES (:email:)',
    params: { email: 'existing@example.com' },
  });
} catch (err) {
  if (err instanceof EngineError && err.code === 'DUPLICATE_KEY') {
    console.error(`Duplicate value for ${err.context.constraint}`);
    // Handle duplicate (e.g., return existing record)
  }
}
```

#### FOREIGN_KEY_VIOLATION

Foreign key constraint violation.

**Template:** `Foreign key constraint violation on ${instanceId}: ${constraint}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `constraint` - Constraint name

#### NOT_NULL_VIOLATION

NOT NULL constraint violation.

**Template:** `NOT NULL constraint violated on ${instanceId}: ${column}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `column` - Column name

#### CHECK_VIOLATION

CHECK constraint violation.

**Template:** `CHECK constraint violated on ${instanceId}: ${constraint}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `constraint` - Constraint name

### Concurrency Errors

#### DEADLOCK

Deadlock detected between concurrent transactions.

**Template:** `Deadlock detected on ${instanceId}`

**Metadata:**

- `instanceId` - Engine instance identifier

**Handling:**

Deadlocks are typically transient - retry the transaction.

**Example:**

```typescript
import { EngineError } from '@tundralibs/drivers/errors';

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof EngineError && err.code === 'DEADLOCK') {
        if (attempt < maxRetries - 1) {
          await new Promise((res) =>
            setTimeout(res, 100 * Math.pow(2, attempt))
          );
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}
```

#### LOCK_TIMEOUT

Timed out waiting for lock acquisition.

**Template:** `Lock acquisition timed out on ${instanceId}`

**Metadata:**

- `instanceId` - Engine instance identifier

#### SERIALIZATION_FAILURE

Serialization failure due to concurrent update (MVCC).

**Template:** `Serialization failure on ${instanceId} (concurrent update)`

**Metadata:**

- `instanceId` - Engine instance identifier

**Context:**

Common in `SERIALIZABLE` isolation level when concurrent transactions conflict.

### Transaction Errors

#### TRANSACTION_NOT_FOUND

Referenced transaction does not exist.

**Template:** `Transaction "${transactionId}" not found on ${instanceId}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `transactionId` - Transaction identifier

#### TRANSACTION_OPERATION_ERROR

Transaction operation failed.

**Template:** `Transaction operation "${operation}" failed on ${instanceId} (txn ${transactionId})`

**Metadata:**

- `operation` - Transaction operation ('begin', 'commit', 'rollback')
- `instanceId` - Engine instance identifier
- `transactionId` - Transaction identifier

**Example:**

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

const txn = await engine.beginTransaction();
try {
  await engine.execute({ sql: 'INSERT INTO ...', transactionId: txn });
  await engine.commitTransaction(txn);
} catch (err) {
  await engine.rollbackTransaction(txn);
  if (
    err instanceof EngineError && err.code === 'TRANSACTION_OPERATION_ERROR'
  ) {
    console.error(`Transaction ${err.context.operation} failed`);
  }
  throw err;
}
```

### Unknown Errors

#### UNKNOWN_ERROR

Fallback when an unrecognized error code is provided.

**Template:** `Unknown error in ${instanceId}: ${reason}`

**Metadata:**

- `instanceId` - Engine instance identifier
- `reason` - Error description
- `originalCode` - The unrecognized code that was provided

## Error Handling Patterns

### Type-Safe Error Checking

```typescript
import { EngineError } from '@tundralibs/drivers/errors';
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const engine = new PostgresEngine('db', { host: 'localhost', database: 'app' });

try {
  await engine.execute({ sql: '...' });
} catch (err) {
  if (err instanceof EngineError) {
    // Type-safe access to error properties
    console.error(
      `Error ${err.code} from ${err.engine}::${err.connectionName}`,
    );
    console.error('Details:', err.context);

    // Handle specific error codes
    switch (err.code) {
      case 'DUPLICATE_KEY':
        // Handle duplicate
        break;
      case 'DEADLOCK':
        // Retry transaction
        break;
      case 'QUERY_TIMEOUT':
        // Log slow query
        break;
      default:
        throw err;
    }
  } else {
    // Unknown error type
    throw err;
  }
}
```

### Error Recovery

```typescript
import type { BaseEngine } from '@tundralibs/drivers/base';
import { EngineError } from '@tundralibs/drivers/errors';

async function connectWithRetry(
  engine: BaseEngine,
  maxAttempts = 3,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await engine.connect();
      return;
    } catch (err) {
      if (err instanceof EngineError && err.code === 'CONNECTION_FAILED') {
        if (attempt < maxAttempts) {
          console.warn(`Connection attempt ${attempt} failed, retrying...`);
          await new Promise((res) => setTimeout(res, delayMs * attempt));
          continue;
        }
      }
      throw err;
    }
  }
}
```

### Cause Chain Inspection

```typescript
import { EngineError } from '@tundralibs/drivers/errors';

function inspectError(err: unknown): void {
  if (err instanceof EngineError) {
    console.error('Engine Error:', {
      code: err.code,
      engine: err.engine,
      connection: err.connectionName,
      message: err.message,
      metadata: err.context,
    });

    // Inspect cause chain
    let cause: unknown = err.cause;
    let depth = 1;
    while (cause) {
      console.error(`Cause ${depth}:`, (cause as Error).message);
      cause = (cause as { cause?: unknown }).cause;
      depth++;
    }
  }
}
```

### Logging Structured Errors

```typescript
import type { EngineError } from '@tundralibs/drivers/errors';

function logEngineError(err: EngineError): void {
  const logEntry = {
    timestamp: err.timeStamp.toISOString(),
    level: 'error',
    errorCode: err.code,
    engine: err.engine,
    connection: err.connectionName,
    message: err.message,
    metadata: err.context,
    stack: err.stack,
    cause: err.cause
      ? {
        message: (err.cause as Error).message,
        stack: (err.cause as Error).stack,
      }
      : undefined,
  };

  console.error(JSON.stringify(logEntry));
}
```

## Examples

### Complete Error Handling Flow

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { EngineError } from '@tundralibs/drivers/errors';

const db = new PostgresEngine('app-db', {
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'appuser',
  password: 'secret',
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutSeconds: 30,
  },
});

// Connection with retry
try {
  await db.connect();
} catch (err) {
  if (err instanceof EngineError) {
    if (err.code === 'CONNECTION_FAILED') {
      console.error('Cannot connect to database');
      console.error('Check host/port and database status');
    } else if (err.code === 'INVALID_AUTH') {
      console.error('Authentication failed - check credentials');
    }
    throw err;
  }
  throw err;
}

// Query with error handling
async function getUser(userId: number) {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = :userId:',
      params: { userId },
    });
    return result.data[0];
  } catch (err) {
    if (err instanceof EngineError) {
      switch (err.code) {
        case 'TABLE_NOT_FOUND':
          console.error('Users table does not exist - run migrations');
          break;
        case 'QUERY_TIMEOUT':
          console.warn(`Query timed out after ${err.context.timeoutMs}ms`);
          break;
        case 'NO_CONNECTION':
          await db.connect();
          return getUser(userId); // Retry
        default:
          console.error(`Query failed: ${err.code}`);
      }
    }
    throw err;
  }
}

// Transaction with error handling
async function transferFunds(fromId: number, toId: number, amount: number) {
  const txn = await db.beginTransaction();

  try {
    await db.execute({
      sql:
        'UPDATE accounts SET balance = balance - :amount: WHERE id = :fromId:',
      params: { amount, fromId },
      transactionId: txn,
    });

    await db.execute({
      sql: 'UPDATE accounts SET balance = balance + :amount: WHERE id = :toId:',
      params: { amount, toId },
      transactionId: txn,
    });

    await db.commitTransaction(txn);
  } catch (err) {
    await db.rollbackTransaction(txn);

    if (err instanceof EngineError) {
      switch (err.code) {
        case 'DEADLOCK':
          console.warn('Deadlock detected - retry transaction');
          // Implement retry logic
          break;
        case 'SERIALIZATION_FAILURE':
          console.warn('Concurrent update conflict');
          // Implement retry logic
          break;
        case 'CHECK_VIOLATION':
          console.error('Insufficient funds or invalid amount');
          break;
        case 'TRANSACTION_OPERATION_ERROR':
          console.error(`Transaction ${err.context.operation} failed`);
          break;
        default:
          console.error(`Transaction failed: ${err.code}`);
      }
    }
    throw err;
  }
}

// Cleanup
await db.disconnect();
```

### Multi-Engine Error Handling

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { RedisEngine } from '@tundralibs/drivers/redis';
import { EngineError } from '@tundralibs/drivers/errors';

async function initEngines() {
  const db = new PostgresEngine('db', {/* ... */});
  const cache = new RedisEngine('cache', {/* ... */});

  const engines = [db, cache];
  const errors: EngineError[] = [];

  // Connect all engines
  for (const engine of engines) {
    try {
      await engine.connect();
    } catch (err) {
      if (err instanceof EngineError) {
        errors.push(err);
        console.error(`Failed to connect ${err.engine}::${err.connectionName}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`${errors.length} engine(s) failed to connect`);
  }

  return { db, cache };
}
```

---

[← Back to Drivers](../README.md)
