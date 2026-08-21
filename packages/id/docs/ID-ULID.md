# ULID

Universally Unique Lexicographically Sortable Identifiers with timestamp-based ordering.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## Table of Contents

- [Overview](#overview)
- [ULID Format Structure](#ulid-format-structure)
- [API Reference](#api-reference)
  - [ulid()](#ulid)
  - [monotonicUlid()](#monotonicUlid)
  - [getTimestamp()](#getTimestamp)
- [Usage Examples](#usage-examples)
  - [Basic Usage](#basic-usage)
  - [Custom Timestamp](#custom-timestamp)
  - [Monotonic Generation](#monotonic-generation)
  - [Timestamp Extraction](#timestamp-extraction)
- [Lexicographic Sorting](#lexicographic-sorting)
- [Use Cases](#use-cases)
- [Features](#features)
- [Best Practices](#best-practices)
- [Comparison with UUID](#comparison-with-uuid)
- [See Also](#see-also)

## Overview

ULID (Universally Unique Lexicographically Sortable Identifier) is a specification-compliant implementation that combines the benefits of UUIDs with the advantages of time-based ordering. ULIDs are 128-bit identifiers that are:

- **Lexicographically sortable** by creation time
- **UUID compatible** (same bit length)
- **Highly readable** (26 characters vs 36 for UUID)
- **URL-safe** with no special characters
- **Collision resistant** (1.21e+24 unique IDs per millisecond)

Unlike traditional UUIDs, ULIDs naturally sort by creation time, making them ideal for databases, distributed systems, and time-series applications where chronological ordering matters.

## ULID Format Structure

A ULID consists of 26 characters encoded using Crockford's Base32 alphabet:

```
01ARZ3NDEKTSV4RRFFQ69G5FAV
└─────────┘└─────────────┘
  10 chars    16 chars
 Timestamp    Randomness
 (48 bits)    (80 bits)
```

### Component Breakdown

| Component  | Length | Bits    | Description                                  |
| ---------- | ------ | ------- | -------------------------------------------- |
| Timestamp  | 10     | 48      | Unix time in milliseconds (up to year 10889) |
| Randomness | 16     | 80      | Cryptographically secure random data         |
| **Total**  | **26** | **128** | Complete ULID identifier                     |

### Character Set

ULIDs use **Crockford's Base32** alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ`

- Excludes: `I`, `L`, `O`, `U` (to avoid visual confusion)
- Case-insensitive (normalized to uppercase)
- URL-safe (no special characters)

## API Reference

### ulid()

Generates a ULID with the current or specified timestamp.

```typescript ignore
function ulid(timestamp?: number, monotonic?: boolean): string;
```

#### Parameters

| Parameter   | Type      | Default      | Description                                                           |
| ----------- | --------- | ------------ | --------------------------------------------------------------------- |
| `timestamp` | `number`  | `Date.now()` | Unix timestamp in milliseconds (clamped under `monotonic`; see below) |
| `monotonic` | `boolean` | `false`      | Enable monotonic ordering within same ms                              |

#### Returns

`string` - A 26-character ULID using Crockford's Base32 encoding

#### Throws

`InvalidOptionError` - If timestamp is outside the valid range (0 to 2^48-1)
or is not an integer (NaN, a fractional value, or Infinity). A NaN or
fractional timestamp is **not** silently coerced — it throws rather than
minting a lossy or epoch-0 ULID.

#### Monotonic clamping

With `monotonic = true`, `ulid()` draws from the same process-wide chain as
[`monotonicUlid()`](#monotonicUlid) and inherits its clock-regression clamp: a
`timestamp` **at or before** the chain's last emitted time is **clamped
forward** — the returned ULID embeds that last time, **not** the value you
passed, and its random component is incremented to preserve ordering. The
supplied timestamp is not silently discarded; this is the documented
spec-compliant behavior for monotonic streams. To embed an arbitrary or older
timestamp exactly (e.g. backfilling historical records), use **non-monotonic**
`ulid(timestamp)` or a fresh `monotonicFactory()`.

#### Example

```typescript
import { ulid } from '@tundralibs/id';

// Generate with current timestamp
const id = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"

// Generate with specific timestamp
const historicalId = ulid(1609459200000); // Jan 1, 2021
// => "01EWGAJ4H0ABC123DEF456GHI7"

// Enable monotonic ordering
const mono1 = ulid(Date.now(), true);
const mono2 = ulid(Date.now(), true);
// mono2 > mono1 guaranteed if same timestamp
```

---

### monotonicUlid()

Generates a monotonic ULID with guaranteed lexicographic ordering within the same millisecond.

```typescript ignore
function monotonicUlid(timestamp?: number): string;
```

#### Parameters

| Parameter   | Type     | Default      | Description                    |
| ----------- | -------- | ------------ | ------------------------------ |
| `timestamp` | `number` | `Date.now()` | Unix timestamp in milliseconds |

#### Returns

`string` - A 26-character monotonic ULID

#### Description

Creates ULIDs that maintain lexicographic sort order even when generated within the same millisecond. When the timestamp matches the previous generation, the random component is incremented instead of regenerated, ensuring consistent ordering.

**Clock regression is clamped.** If the system clock steps backwards (NTP correction, VM resume) or an explicitly older `timestamp` is passed, the generator keeps emitting at the last observed time and increments the random component rather than minting a smaller ULID. Ordering is therefore preserved across a backward clock — at the cost of the emitted ULID's embedded timestamp being the clamped (last) time, not the requested one. This matches the ULID reference implementation.

**Important:** This function maintains global state and is not thread-safe across multiple isolates or workers. Use regular `ulid()` for concurrent scenarios. For independent monotonic streams in one process, prefer `monotonicFactory()` so each stream owns its own clamped chain.

#### Example

```typescript
import { monotonicUlid } from '@tundralibs/id';

// Generate multiple IDs in rapid succession
const ids = Array.from({ length: 100 }, () => monotonicUlid());

// Verify they're sorted
const sorted = [...ids].sort();
console.log(ids.every((id, i) => id === sorted[i]));
// => true

// High-frequency logging
const log1 = monotonicUlid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const log2 = monotonicUlid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAW"
// log2 > log1 guaranteed
```

---

### getTimestamp()

Extracts the timestamp component from a ULID string.

```typescript ignore
function getTimestamp(id: string): number;
```

#### Parameters

| Parameter | Type     | Description               |
| --------- | -------- | ------------------------- |
| `id`      | `string` | A valid 26-character ULID |

#### Returns

`number` - Unix timestamp in milliseconds when the ULID was created

#### Throws

`InvalidULIDError` - If the ULID format is invalid. This is a full validation,
not a length check: the string must be exactly 26 characters, **every**
character (the random segment as well as the timestamp segment) must be a valid
Crockford's Base32 symbol, and the decoded 48-bit timestamp must not exceed the
maximum `ulid()` itself would ever encode (2^48-1). `error.context.reason` is
`'length'`, `'character'`, or `'timestamp'` accordingly.

#### Example

```typescript
import { getTimestamp, ulid } from '@tundralibs/id';

const id = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"

const timestamp = getTimestamp(id);
// => 1546300800000

const date = new Date(timestamp);
// => 2019-01-01T00:00:00.000Z

// Calculate age of ULID
const ageMs = Date.now() - getTimestamp(id);
const ageHours = ageMs / (1000 * 60 * 60);
console.log(`ID is ${ageHours.toFixed(2)} hours old`);
```

## Usage Examples

### Basic Usage

Generate ULIDs for general-purpose unique identifiers:

```typescript
import { ulid } from '@tundralibs/id';

declare const db: { users: { insert(row: unknown): Promise<void> } };

// Simple ID generation
const userId = ulid();
const orderId = ulid();
const sessionId = ulid();

// Store in database
await db.users.insert({
  id: userId,
  name: 'John Doe',
  createdAt: new Date(),
});

// Use in URLs
const url = `https://api.example.com/orders/${orderId}`;
```

### Custom Timestamp

Generate ULIDs with specific timestamps for testing or backdating. Use the
**non-monotonic** form `ulid(timestamp)` (shown below) for backdating: it embeds
the timestamp exactly. `ulid(timestamp, true)` would instead route through the
shared monotonic chain and clamp a past timestamp forward (see
[Monotonic clamping](#monotonic-clamping)).

```typescript
import { ulid } from '@tundralibs/id';

// Generate ID for a past event
const pastEvent = ulid(new Date('2023-01-01').getTime());

// Generate IDs for a batch at specific time
const batchTime = Date.now();
const batch = [
  { id: ulid(batchTime), item: 'A' },
  { id: ulid(batchTime), item: 'B' },
  { id: ulid(batchTime), item: 'C' },
];

// Future timestamp (for scheduled events)
const futureTime = Date.now() + 86400000; // +1 day
const scheduledId = ulid(futureTime);
```

### Monotonic Generation

Ensure strict ordering for high-frequency ID generation:

```typescript
import { monotonicUlid } from '@tundralibs/id';

// High-throughput logging
class Logger {
  log(message: string) {
    const logEntry = {
      id: monotonicUlid(),
      message,
      timestamp: Date.now(),
    };

    // IDs will be sorted even if logs happen in same millisecond
    this.writeToDatabase(logEntry);
  }

  private writeToDatabase(entry: unknown): void {
    // Persist the entry with your storage layer of choice
  }
}

// Event stream processing
const events = [];
for (let i = 0; i < 10000; i++) {
  events.push({
    id: monotonicUlid(),
    type: 'user_action',
    data: { action: i },
  });
}

// Events are guaranteed to be sortable by ID
const sortedEvents = events.sort((a, b) => a.id.localeCompare(b.id));
```

### Timestamp Extraction

Extract and use timestamp information from ULIDs:

```typescript
import { getTimestamp, ulid } from '@tundralibs/id';

// Validate recent activity
function isRecentlyCreated(id: string, maxAgeMinutes: number): boolean {
  const timestamp = getTimestamp(id);
  const ageMs = Date.now() - timestamp;
  return ageMs < maxAgeMinutes * 60 * 1000;
}

// Filter by time range
const ulids = ['01ARZ3NDEK...', '01EWGAJ4H0...', '01FKPM6WQG...'];
const recentIds = ulids.filter((id) => {
  const timestamp = getTimestamp(id);
  const cutoff = Date.now() - 3600000; // 1 hour ago
  return timestamp > cutoff;
});

// Group by time period
function groupByHour(ids: string[]) {
  return ids.reduce((groups, id) => {
    const timestamp = getTimestamp(id);
    const hour = new Date(timestamp).setMinutes(0, 0, 0);

    if (!groups[hour]) groups[hour] = [];
    groups[hour].push(id);

    return groups;
  }, {} as Record<number, string[]>);
}

// Debug: Show creation time
console.log(`ID created at: ${new Date(getTimestamp(ulid())).toISOString()}`);
```

## Lexicographic Sorting

ULIDs are designed to sort lexicographically by creation time, making database queries and range scans efficient.

### How It Works

1. **Timestamp First**: The first 10 characters encode the timestamp
2. **Base32 Encoding**: Preserves numerical ordering in string comparison
3. **Random Suffix**: Provides uniqueness within the same millisecond

### Sorting Example

```typescript
import { ulid } from '@tundralibs/id';

declare const db: {
  collection: {
    find(query: unknown): { sort(order: unknown): Promise<unknown[]> };
  };
};
declare const startTime: number;
declare const endTime: number;

// Generate ULIDs over time
const id1 = ulid(1600000000000); // Sept 13, 2020
const id2 = ulid(1650000000000); // April 15, 2022
const id3 = ulid(1700000000000); // Nov 14, 2023

// String comparison sorts by time
const ids = [id3, id1, id2];
ids.sort();
// => [id1, id2, id3] - chronologically ordered!

// Database range queries
const results = await db.collection.find({
  id: {
    $gte: ulid(startTime),
    $lte: ulid(endTime),
  },
}).sort({ id: 1 });
```

### Benefits for Databases

- **Index-friendly**: Natural clustering in B-tree indexes
- **Range queries**: Efficiently query time ranges using ID comparisons
- **No extra timestamp field**: Creation time encoded in the ID itself
- **Reduced index size**: Single index serves both uniqueness and ordering

## Use Cases

### Time-Series Data

ULIDs excel in scenarios where chronological ordering matters:

```typescript
import { ulid } from '@tundralibs/id';

// Sensor readings
interface SensorReading {
  id: string;
  sensorId: string;
  value: number;
  temperature: number;
}

const reading: SensorReading = {
  id: ulid(),
  sensorId: 'sensor-001',
  value: 23.5,
  temperature: 20.1,
};

// Automatically sorted by time when queried by ID
```

### Distributed Databases

Generate IDs across multiple nodes without coordination:

```typescript
import { ulid } from '@tundralibs/id';

// Node 1
const record1 = { id: ulid(), data: 'from-node-1' };

// Node 2 (different machine, same millisecond)
const record2 = { id: ulid(), data: 'from-node-2' };

// When merged, they sort by creation time despite being
// generated on different machines with no coordination
```

### Event Logging

Maintain event order with high-frequency logging:

```typescript
import { monotonicUlid } from '@tundralibs/id';

class EventLogger {
  private eventStore!: { append(event: unknown): Promise<void> };

  async logEvent(type: string, data: unknown) {
    const event = {
      id: monotonicUlid(), // Guarantees order
      type,
      data,
      timestamp: Date.now(),
    };

    await this.eventStore.append(event);
  }
}

// Even thousands of events per second maintain order
const logger = new EventLogger();
for (let i = 0; i < 10000; i++) {
  await logger.logEvent('user_action', { index: i });
}
```

### API Request IDs

Track and correlate API requests:

```typescript ignore
import { ulid } from '@tundralibs/id';

app.use((req, res, next) => {
  req.id = ulid();
  res.setHeader('X-Request-ID', req.id);

  // Logs automatically sorted by time
  logger.info({
    requestId: req.id,
    method: req.method,
    path: req.path,
  });

  next();
});
```

## Features

### 128-bit UUID Compatible

ULIDs use the same bit length as UUIDs, making them suitable for any system designed for UUID storage:

- **Storage**: 16 bytes (same as UUID)
- **String representation**: 26 characters (vs 36 for UUID)
- **Collision resistance**: Equivalent to UUID v4

### Sortable by Creation Time

The timestamp-first design enables natural chronological ordering:

```typescript
import { ulid } from '@tundralibs/id';

const ids = [
  ulid(Date.now() + 1000), // +1 second
  ulid(Date.now()), // now
  ulid(Date.now() - 1000), // -1 second
];

// Sort lexicographically - they're in time order!
ids.sort();
```

### Crockford Base32 Encoding

Uses a carefully chosen alphabet for optimal human readability:

- **No ambiguous characters**: Excludes I, L, O, U
- **Case-insensitive**: Can be normalized to uppercase
- **URL-safe**: No encoding needed for web usage
- **Printable**: Safe for display in any medium

### Cryptographically Secure

The random component uses the Web Crypto API:

```typescript
// 80 bits of cryptographically secure randomness
// Provided by crypto.getRandomValues()
const random = crypto.getRandomValues(new Uint8Array(10));
```

**Security properties:**

- Unpredictable random component
- Resistant to timing attacks
- No observable patterns
- Suitable for security-sensitive applications

## Best Practices

### Use Monotonic ULIDs for High-Frequency Generation

When generating many IDs in rapid succession:

```typescript
import { monotonicUlid, ulid } from '@tundralibs/id';

// ❌ Don't use regular ulid() for high-frequency
const unorderedIds = Array.from({ length: 10000 }, () => ulid());
// May have inconsistent ordering within same millisecond

// ✅ Use monotonicUlid() instead
const ids = Array.from({ length: 10000 }, () => monotonicUlid());
// Guaranteed sort order
```

### Store as String in Databases

While ULIDs can be stored as binary (16 bytes), string storage is recommended:

```typescript ignore
// ✅ Recommended: String storage
{
  _id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  name: "John Doe"
}

// Benefits:
// - Human readable in database tools
// - Natural lexicographic sorting
// - Easier debugging and logging
// - Compatible with text-based protocols
```

### Use Regular ulid() for Distributed Systems

In multi-process or multi-machine environments:

```typescript
import { monotonicUlid, ulid } from '@tundralibs/id';

// ✅ Use regular ulid() - no global state
// Different servers, workers, or isolates
const id = ulid();

// ❌ Don't use monotonicUlid() across processes
// Global state not shared between processes
const monotonicId = monotonicUlid(); // May not be monotonic across boundaries
```

### Include Timestamp Extraction in Queries

Leverage the timestamp component for efficient filtering:

```typescript
import { ulid } from '@tundralibs/id';

declare const db: { find(query: unknown): Promise<unknown[]> };
declare const startTime: number;
declare const endTime: number;

// Generate range boundaries
const startId = ulid(startTime);
const endId = ulid(endTime);

// Query by ID range instead of separate timestamp field
const results = await db.find({
  id: { $gte: startId, $lte: endId },
});
```

### Validate ULID Format

Always validate ULIDs from external sources:

```typescript
import { getTimestamp } from '@tundralibs/id';

function isValidUlid(id: string): boolean {
  if (id.length !== 26) return false;

  const validChars = /^[0-9A-HJKMNP-TV-Z]+$/i;
  if (!validChars.test(id)) return false;

  try {
    getTimestamp(id);
    return true;
  } catch {
    return false;
  }
}
```

### Consider Index Performance

ULIDs naturally cluster by time in B-tree indexes:

```typescript
import { ulid } from '@tundralibs/id';

declare const db: {
  collection: {
    createIndex(spec: unknown): Promise<void>;
    find(query: unknown): Promise<unknown[]>;
  };
};

// ✅ Good: New ULIDs append to index
// Minimizes index rebalancing and write amplification
await db.collection.createIndex({ id: 1 });

// Query patterns benefit from time-based clustering
const recentDocs = await db.collection.find({
  id: { $gte: ulid(Date.now() - 86400000) }, // Last 24 hours
});
```

## Comparison with UUID

| Feature                  | ULID                      | UUID v4                      |
| ------------------------ | ------------------------- | ---------------------------- |
| **Length**               | 26 characters             | 36 characters (with hyphens) |
| **Encoding**             | Base32 (Crockford)        | Hexadecimal                  |
| **Sortable**             | ✅ Yes (by timestamp)     | ❌ No (random)               |
| **Timestamp**            | ✅ Embedded (48 bits)     | ❌ None                      |
| **Randomness**           | 80 bits                   | 122 bits                     |
| **Collision Resistance** | 1.21e+24 per millisecond  | ~5.3e+36 total               |
| **URL-safe**             | ✅ Yes (no special chars) | ⚠️ Requires encoding         |
| **Human Readable**       | ✅ Better (shorter)       | ⚠️ Verbose                   |
| **Database Index**       | ✅ Efficient (clustered)  | ⚠️ Random (fragmented)       |
| **Case Sensitive**       | ❌ No                     | ❌ No                        |
| **Bit Length**           | 128 bits                  | 128 bits                     |
| **Monotonic Option**     | ✅ Yes                    | ❌ No                        |

### When to Choose ULID

**Use ULID when:**

- Time-based sorting is important
- You need efficient database indexes
- Shorter string representation matters
- You want timestamp extraction capability
- Working with time-series data

**Use UUID when:**

- Maximum collision resistance is required
- Industry standards mandate UUID
- No ordering requirements exist
- Legacy system compatibility needed

### Migration from UUID

ULIDs can coexist with UUIDs in the same system:

```typescript ignore
import { ulid } from '@tundralibs/id';
import { v4 as uuidv4 } from 'uuid';

// Gradual migration
interface Document {
  id: string; // Can be either ULID or UUID
  type: 'ulid' | 'uuid';
}

function createDocument(): Document {
  return {
    id: ulid(), // New documents use ULID
    type: 'ulid',
  };
}

// Identify and handle both
function getCreatedAt(doc: Document): Date {
  if (doc.type === 'ulid') {
    return new Date(getTimestamp(doc.id));
  } else {
    // UUID documents need separate timestamp field
    return doc.createdAt;
  }
}
```

## See Also

- [Main ID Documentation](../README.md) - Overview of all ID generators
- [ObjectID Documentation](./ID-ObjectID.md) - MongoDB-compatible identifiers
- [NanoID Documentation](./ID-NanoID.md) - Compact URL-safe IDs
- [SequenceID Documentation](./ID-SequenceID.md) - Sequential identifiers
- [Comparison Guide](./ID-Comparison.md) - Choosing the right ID type
- [ULID Specification](https://github.com/ulid/spec) - Official ULID spec

---

[← Back to ID Documentation](../README.md)
