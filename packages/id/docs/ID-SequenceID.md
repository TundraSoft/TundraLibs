# SequenceID

Database-friendly sequential 64-bit integer ID generator for distributed systems.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Size: 64-bit Integer](https://img.shields.io/badge/size-64--bit%20integer-blue)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [ID Structure](#id-structure)
- [Installation](#installation)
- [API Reference](#api-reference)
  - [sequenceID()](#sequenceid)
  - [Generator Function](#generator-function)
- [Usage Examples](#usage-examples)
  - [Basic Usage](#basic-usage)
  - [Custom Counter Start](#custom-counter-start)
  - [Counter Override](#counter-override)
  - [Distributed Systems](#distributed-systems)
- [Use Cases](#use-cases)
- [Database Integration](#database-integration)
  - [PostgreSQL Example](#postgresql-example)
  - [MySQL/MariaDB Example](#mysqlmariadb-example)
- [Best Practices](#best-practices)
- [MariaDB UUID_SHORT() Comparison](#mariadb-uuid_short-comparison)
- [Performance](#performance)
- [Related Documentation](#related-documentation)

## Overview

SequenceID generates 64-bit integers suitable for database primary keys, modeled directly on MariaDB's `UUID_SHORT()` function. Each ID combines a process-derived server ID, the generator's startup time, and a monotonic counter — no random component.

The generated IDs are:

- **Sequential**: Monotonically increasing for optimal B-tree index performance
- **Server-aware**: Incorporates process ID to discriminate across instances
- **Database-friendly**: 64-bit integers compatible with `BIGINT` columns
- **Traceable**: Embeds server and startup-time information for debugging

**Why SequenceID?**

- **Better index performance**: sequential IDs cluster well in B-tree indexes; random UUIDs cause page splits.
- **Smaller storage**: 8 bytes vs 16 bytes for UUID.
- **Native database type**: standard `BIGINT`, no special UUID columns needed.
- **No database round-trip**: generated entirely client-side.

> **Uniqueness contract.** SequenceID is collision-free **within a single generator** for up to 16,777,216 IDs per startup-second. It is **not** collision-free across multiple generators in the same process, nor across multiple processes with colliding `PID % 256` started in the same wall-clock second. Treat `sequenceID()` as a singleton per logical sequence (e.g. one per table) and instantiate it at module load. For distributed/clustered scenarios, prefer `ulid` or `ObjectID`.

## Features

| Feature                          | Support | Description                                          |
| -------------------------------- | ------- | ---------------------------------------------------- |
| 64-bit Integer Output            | ✅      | Native `BIGINT` support in all major databases       |
| Sequential Generation            | ✅      | Monotonically increasing for index optimization      |
| Server-Aware                     | ✅      | Embeds process ID to discriminate cross-instance     |
| Timestamp Component              | ✅      | Includes startup time for temporal ordering          |
| Counter Management               | ✅      | Internal 24-bit counter with override capability     |
| Dependency-light                 | ⚠️      | Uses `@tundralibs/compat` for the process ID         |
| Collision Resistant (in-process) | ✅      | Up to 16,777,216 IDs/sec/generator                   |
| Database Optimized               | ✅      | Sequential nature improves B-tree index performance  |
| Distributed Systems              | ⚠️      | Caller must ensure unique `(PID % 256, startup_sec)` |

## ID Structure

SequenceID generates a 64-bit integer composed of three components — this matches MariaDB `UUID_SHORT()` exactly:

```
┌─────────────┬──────────────────────┬──────────────────────┐
│  Server ID  │  Startup Time        │    Counter           │
│   (8 bits)  │   (32 bits)          │   (24 bits)          │
└─────────────┴──────────────────────┴──────────────────────┘
     0-255       Unix seconds            0 - 16,777,215
```

**Component Breakdown:**

1. **Server ID (8 bits, bits 56-63)**: `getProcessId() % 256` (or `0` if PID unavailable).
   - Discriminates processes by PID.
   - PIDs that share a residue mod 256 (e.g., 1 and 257) will collide on this field.

2. **Startup Time (32 bits, bits 24-55)**: Unix epoch seconds at generator construction.
   - Set once per `sequenceID()` call; constant for the generator's lifetime.
   - Two generators created in the same wall-clock second share this value.

3. **Counter (24 bits, bits 0-23)**: Per-generator monotonic counter.
   - Starts at `seed` (default `0`), increments on each call.
   - **Safe range: 16,777,216 IDs per startup-second.** Past this, the counter spills into the startup-time bits and may collide with values from a hypothetical generator created in a later second.
   - Can be reset mid-stream via the `gen(N)` override; this becomes the new value.

**Example ID Decomposition:**

```typescript ignore
ID: 72623859790382856n

Server ID:    1            (Process ID % 256)
Startup Time: 1713849600   (April 23, 2024 00:00:00 UTC)
Counter:      8            (8th call to this generator)
```

## Installation

**Deno:**

```bash
deno add @tundralibs/id
```

**Bun:**

```bash
bunx jsr add @tundralibs/id
```

**Node.js:**

```bash
npx jsr add @tundralibs/id
```

**Direct import (Deno):**

```typescript
import { sequenceID } from 'jsr:@tundralibs/id';
```

## API Reference

### sequenceID()

Creates a database-friendly sequential ID generator.

```typescript ignore
function sequenceID(cnt?: number): (counter?: number) => bigint;
```

**Parameters:**

| Parameter | Type     | Required | Default | Description                                  |
| --------- | -------- | -------- | ------- | -------------------------------------------- |
| `cnt`     | `number` | No       | `0`     | Initial counter value (non-negative integer) |

**Returns:**

A generator function that produces unique 64-bit integer IDs.

**Throws:**

- `InvalidOptionError` - If initial counter value is negative or not an integer
  (NaN, a fractional value, or Infinity)

**Example:**

```typescript
import { sequenceID } from '@tundralibs/id';

const generator = sequenceID();
const id = generator(); // 72623859790382856n
```

### Generator Function

The returned generator function can be called to produce IDs.

```typescript
type GeneratorFunction = (counter?: number) => bigint;
```

**Parameters:**

| Parameter | Type     | Required | Default          | Description                                   |
| --------- | -------- | -------- | ---------------- | --------------------------------------------- |
| `counter` | `number` | No       | Internal counter | Override counter value (non-negative integer) |

**Returns:**

A unique 64-bit `bigint` ID.

**Throws:**

- `InvalidOptionError` - If counter override value is negative or not an integer
  (NaN, a fractional value, or Infinity)

**Behavior:**

- Without argument: Uses and increments internal counter
- With argument: Resets internal counter to provided value
- Counter increments without wrapping; it is collision-free within the 24-bit
  range (0-16,777,215) per startup-second, after which it spills into the
  startup-time bits (see [ID Structure](#id-structure))

## Usage Examples

### Basic Usage

Generate sequential IDs for database records:

```typescript
import { sequenceID } from '@tundralibs/id';

// Create a generator
const idGen = sequenceID();

// Generate IDs
const id1 = idGen(); // 72623859790382856n
const id2 = idGen(); // 72623859790382857n
const id3 = idGen(); // 72623859790382858n

console.log(id2 - id1); // 1n (sequential)
```

### Custom Counter Start

Start counting from a specific value:

```typescript
import { sequenceID } from '@tundralibs/id';

// Start counter at 1000
const idGen = sequenceID(1000);

const id1 = idGen(); // Counter: 1000
const id2 = idGen(); // Counter: 1001
const id3 = idGen(); // Counter: 1002
```

### Counter Override

Reset counter mid-sequence for specific scenarios:

```typescript
import { sequenceID } from '@tundralibs/id';

const idGen = sequenceID();

const id1 = idGen(); // Uses internal counter: 0
const id2 = idGen(); // Increments to: 1
const id3 = idGen(5000); // Override to: 5000
const id4 = idGen(); // Continues from: 5001

console.log((id2 & 0xFFn) - (id1 & 0xFFn)); // 1n
console.log((id4 & 0xFFn) - (id3 & 0xFFn)); // 1n
```

### Distributed Systems

Safe ID generation across multiple servers:

```typescript
import { sequenceID } from '@tundralibs/id';

// Server 1 (Process ID: 1234)
const server1Gen = sequenceID();
const server1Id = server1Gen(); // Includes server info

// Server 2 (Process ID: 5678)
const server2Gen = sequenceID();
const server2Id = server2Gen(); // Different server component

// Extract server ID from generated ID
const extractServerId = (id: bigint): bigint => {
  return (id >> 56n) & 0xFFn;
};

const server1Info = extractServerId(server1Id); // 1234 % 256
const server2Info = extractServerId(server2Id); // 5678 % 256
```

## Use Cases

### PostgreSQL BIGINT Primary Keys

Replace auto-increment with globally unique sequential IDs:

```typescript
import { sequenceID } from '@tundralibs/id';

const userIdGen = sequenceID();

interface User {
  id: bigint;
  username: string;
  email: string;
}

function createUser(username: string, email: string): User {
  return {
    id: userIdGen(),
    username,
    email,
  };
}

const user = createUser('alice', 'alice@example.com');
console.log(user.id); // 72623859790382856n
```

### Auto-Increment Replacement

Eliminate database coordination for distributed ID generation:

```typescript
import { sequenceID } from '@tundralibs/id';

// Traditional auto-increment requires database lock
// SequenceID works without database coordination

const orderIdGen = sequenceID();

class Order {
  id: bigint;
  customerId: string;
  total: number;

  constructor(customerId: string, total: number) {
    this.id = orderIdGen(); // No database roundtrip
    this.customerId = customerId;
    this.total = total;
  }
}

const order = new Order('cust_123', 99.99);
```

### High-Performance Inserts

Optimize database inserts with sequential IDs:

```typescript
import { sequenceID } from '@tundralibs/id';

const logIdGen = sequenceID();

interface LogEntry {
  id: bigint;
  timestamp: Date;
  level: string;
  message: string;
}

// Batch insert with pre-generated IDs
function batchInsertLogs(entries: Omit<LogEntry, 'id'>[]): LogEntry[] {
  return entries.map((entry) => ({
    id: logIdGen(),
    ...entry,
  }));
}

const logs = batchInsertLogs([
  { timestamp: new Date(), level: 'INFO', message: 'App started' },
  { timestamp: new Date(), level: 'DEBUG', message: 'Config loaded' },
  { timestamp: new Date(), level: 'INFO', message: 'Server listening' },
]);
```

## Database Integration

### PostgreSQL Example

Using SequenceID with PostgreSQL BIGINT columns:

```sql
-- Create table with BIGINT primary key
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index on sequential IDs is highly efficient
CREATE INDEX idx_users_id ON users(id);
```

```typescript ignore
import { sequenceID } from '@tundralibs/id';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://localhost/mydb',
});

const userIdGen = sequenceID();

async function createUser(username: string, email: string) {
  const id = userIdGen();

  await pool.query(
    'INSERT INTO users (id, username, email) VALUES ($1, $2, $3)',
    [id.toString(), username, email],
  );

  return id;
}

// Usage
const userId = await createUser('alice', 'alice@example.com');
console.log(`Created user with ID: ${userId}`);
```

### MySQL/MariaDB Example

Compatible with MySQL/MariaDB BIGINT UNSIGNED:

```sql
-- Create table with BIGINT UNSIGNED primary key
CREATE TABLE orders (
  id BIGINT UNSIGNED PRIMARY KEY,
  customer_id VARCHAR(50) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id (customer_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;
```

```typescript ignore
import { sequenceID } from '@tundralibs/id';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  database: 'mydb',
});

const orderIdGen = sequenceID();

async function createOrder(customerId: string, total: number) {
  const id = orderIdGen();

  await connection.execute(
    'INSERT INTO orders (id, customer_id, total) VALUES (?, ?, ?)',
    [id.toString(), customerId, total],
  );

  return id;
}

// Usage
const orderId = await createOrder('cust_123', 99.99);
console.log(`Created order with ID: ${orderId}`);
```

## Best Practices

### 1. Create One Generator Per Entity Type

Use separate generators for different entity types:

```typescript
import { sequenceID } from '@tundralibs/id';

// One generator per entity type
const userIdGen = sequenceID();
const orderIdGen = sequenceID();
const productIdGen = sequenceID();

// Don't share generators across entity types
```

### 2. Store as String in JavaScript

Convert to string for JSON serialization:

```typescript
import { sequenceID } from '@tundralibs/id';

const idGen = sequenceID();
const id = idGen();

// Store as string in JavaScript objects
const user = {
  id: id.toString(), // "72623859790382856"
  username: 'alice',
};

// Parse back to bigint when needed
const parsedId = BigInt(user.id);
```

### 3. Use BIGINT Columns in Database

Always use BIGINT (or BIGINT UNSIGNED) for ID columns:

```sql
-- PostgreSQL
CREATE TABLE records (
  id BIGINT PRIMARY KEY
);

-- MySQL/MariaDB
CREATE TABLE records (
  id BIGINT UNSIGNED PRIMARY KEY
);

-- Don't use INT or VARCHAR
```

### 4. Respect the 24-bit Counter Safe Range

The counter occupies the low 24 bits (0-16,777,215) and increments **without
wrapping** — it does not wrap at 255. Within one startup-second a single
generator stays collision-free for up to 16,777,216 IDs; past that the counter
spills into the startup-time bits and may collide with a generator created in a
later second:

```typescript
import { sequenceID } from '@tundralibs/id';

const idGen = sequenceID(250);

// The counter increments monotonically — it does NOT wrap at 255.
const id250 = idGen(); // Counter: 250
const id251 = idGen(); // Counter: 251
// ... continues up to 16,777,215 within the 24-bit safe range, then spills over.
```

For workloads that emit more than ~16M IDs per startup-second from one
generator, switch to `ulid` or `ObjectID`.

### 5. Consider Clock Skew in Distributed Systems

Ensure system clocks are synchronized:

```bash
# Use NTP to synchronize clocks
sudo systemctl enable --now systemd-timesyncd

# Verify synchronization
timedatectl status
```

### 6. Monitor for Collisions

While extremely rare, monitor for duplicate IDs:

```typescript
import { sequenceID } from '@tundralibs/id';

const idGen = sequenceID();
const generatedIds = new Set<string>();

function generateUniqueId(): bigint {
  const id = idGen();
  const idStr = id.toString();

  if (generatedIds.has(idStr)) {
    console.error('Collision detected!');
    // Implement collision handling
  }

  generatedIds.add(idStr);
  return id;
}
```

### 7. Use Appropriate Index Types

Leverage sequential nature for index optimization:

```sql
-- B-tree indexes work great with sequential IDs
CREATE INDEX idx_sequential ON records(id);

-- Avoid hash indexes for range queries
-- HASH indexes don't benefit from sequential nature
```

## MariaDB UUID_SHORT() Comparison

SequenceID mirrors MariaDB's `UUID_SHORT()` bit layout exactly:

| Aspect           | SequenceID                       | MariaDB UUID_SHORT()            |
| ---------------- | -------------------------------- | ------------------------------- |
| Output Type      | 64-bit bigint                    | 64-bit unsigned bigint          |
| Server ID        | `process.pid % 256` (8 bits)     | `server_id` config (8 bits)     |
| Timestamp        | Startup time, seconds (32 bits)  | `server_startup_time` (32 bits) |
| Counter          | 24-bit, per-generator            | 24-bit, per-server              |
| Uniqueness model | Per-generator (caller singleton) | Per-server (DB coordinates)     |
| Generation site  | Client (no DB roundtrip)         | Server (one round-trip per ID)  |
| Portability      | Any JS runtime                   | MariaDB only                    |

**Key Differences:**

1. **Counter scope**: MariaDB shares a single counter across the whole server; SequenceID's counter lives in the generator closure. Multiple `sequenceID()` instances in one process do **not** share state — they will produce identical IDs if created in the same startup-second. Treat each `sequenceID()` as a singleton per logical sequence.
2. **Client-side generation**: no database query needed.
3. **Process-based server ID**: uses `process.pid % 256` instead of a configured `server_id`. Cluster operators are responsible for ensuring PIDs don't collide modulo 256 across nodes (or for accepting the collision probability).
4. **Runtime agnostic**: works in Deno, Bun, Node.

**When to use SequenceID over UUID_SHORT():**

- Need client-side ID generation without a database round-trip.
- Using PostgreSQL, MongoDB, or any non-MariaDB database.
- Want portable code across databases.
- Single-process or low-process-count deployment where a `(PID % 256, startup_sec)` collision is unlikely.

**When to use UUID_SHORT() instead:**

- Already on MariaDB with `server_id` configured per node in a cluster.
- Need a guaranteed-unique counter coordinated by the database.

**When to use ULID or ObjectID instead:**

- Distributed deployments where multiple nodes may share `PID % 256`.
- Workloads emitting more than ~16M IDs per startup-second per generator.
- Any context where collision must be cryptographically improbable rather than schedule-controlled.

## Performance

SequenceID is optimized for high-throughput generation:

```typescript
import { sequenceID } from '@tundralibs/id';

// Benchmark: Generate 1 million IDs
const idGen = sequenceID();
const iterations = 1_000_000;

console.time('Generate 1M IDs');
for (let i = 0; i < iterations; i++) {
  idGen();
}
console.timeEnd('Generate 1M IDs');
// Typical: ~50-100ms on modern hardware
```

**Performance Characteristics:**

- **Generation Speed**: ~10-20 million IDs/second (single-threaded)
- **Memory Overhead**: Minimal (one generator instance)
- **CPU Usage**: Very low (simple bit operations)
- **Database Impact**: None (client-side generation)

**Comparison with Alternatives:**

| Method              | Speed                | Database Load | Uniqueness Guarantee                |
| ------------------- | -------------------- | ------------- | ----------------------------------- |
| SequenceID          | ~15M/sec             | Zero          | Per-generator (caller singleton)    |
| UUID v4             | ~5M/sec              | Zero          | Very high (cryptographic random)    |
| Auto-increment      | ~100K/sec            | High          | Perfect (single DB)                 |
| Database UUID_SHORT | ~10K/sec (roundtrip) | High          | Per-server (DB-coordinated counter) |
| NanoID              | ~8M/sec              | Zero          | Very high (cryptographic random)    |
| ULID                | ~3M/sec              | Zero          | Very high (cryptographic random)    |

## Related Documentation

- [ID Generator Overview](../README.md) - Main documentation for all ID generators
- [NanoID](./ID-NanoID.md) - URL-safe string IDs
- [ObjectID](./ID-ObjectID.md) - MongoDB-compatible IDs
- [ULID](./ID-ULID.md) - Lexicographically sortable IDs
- [SimpleID](./ID-SimpleID.md) - Minimal unique IDs

---

**[⬅ Back to ID Documentation](../README.md)**
