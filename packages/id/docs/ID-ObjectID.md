# ObjectID

MongoDB-**inspired** mixed-radix identifiers with embedded timestamp, machine, process, worker, and counter information — **not** the canonical 24-char hex `ObjectId` (see [MongoDB Compatibility](#mongodb-compatibility)).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [ID Structure](#id-structure)
- [API Reference](#api-reference)
  - [ObjectID Function](#objectid-function)
  - [Parameters](#parameters)
- [Usage Examples](#usage-examples)
  - [Basic Usage](#basic-usage)
  - [Custom Counter](#custom-counter)
  - [Custom Machine ID](#custom-machine-id)
  - [Distributed Systems](#distributed-systems)
- [Timestamp Extraction](#timestamp-extraction)
- [Use Cases](#use-cases)
- [Features](#features)
- [Best Practices](#best-practices)
- [MongoDB Compatibility](#mongodb-compatibility)

## Overview

ObjectID generates unique identifiers **inspired by** MongoDB's ObjectId, but they are **not** the canonical 24-character hex format. The output is a fixed-length mixed-radix string (26 characters with the default `machineIdLength`) that embeds a timestamp, machine identifier, process ID, worker ID, and an incrementing counter. This ensures global uniqueness across distributed systems while maintaining chronological sortability. To store one as a MongoDB BSON `ObjectId`, truncate to 24 hex chars first (see [Converting to MongoDB](#converting-to-mongodb)).

**Key Characteristics:**

- **26 characters** - Fixed-length mixed-radix string (`23 + machineIdLength`)
- **Embedded timestamp** - Millisecond precision for sortability
- **Distributed-safe** - Machine and process identifiers prevent collisions
- **MongoDB-inspired** - Similar layout, but **not** a canonical BSON ObjectId
- **Traceable** - Decode origin machine, process, and creation time

## ID Structure

An ObjectID consists of 26 characters total, broken down as follows:

```
65a1b2c3019aB30c1f4q000001
│       │  │  │   │ └───── Counter (6 decimal digits) - Incrementing sequence
│       │  │  │   └─────── Worker ID (2 alphanumeric) - Random collision resistance
│       │  │  └─────────── Process ID (4 hex digits) - Derived from getProcessId()
│       │  └────────────── Machine ID (3 chars) - Auto-generated or custom
│       └───────────────── Milliseconds (3 decimal digits) - Sub-second precision
└───────────────────────── Timestamp (8 hex digits) - Unix seconds since epoch
```

Note the segments use **different radixes** (hex timestamp/process, decimal
milliseconds/counter, mixed-case alphanumeric machine/worker), so the string
is **not** a uniform hex value.

### Component Breakdown

| Component    | Length | Description                                        | Example    |
| ------------ | ------ | -------------------------------------------------- | ---------- |
| Timestamp    | 8      | Unix timestamp (seconds since epoch), **hex**      | `65a1b2c3` |
| Milliseconds | 3      | Millisecond component, **decimal** (000-999)       | `019`      |
| Machine ID   | 3      | Machine identifier (auto-generated or provided)    | `aB3`      |
| Process ID   | 4      | Process identifier (`getProcessId() % 65536`), hex | `0c1f`     |
| Worker ID    | 2      | Random per-generator worker id (alphanumeric)      | `4q`       |
| Counter      | 6      | Incrementing counter, **decimal** (zero-padded)    | `000001`   |

**Total Length**: 26 characters

> On runtimes that expose no process identifier (Cloudflare Workers, browsers),
> the Process ID component falls back to `0000`; the random Worker ID keeps IDs
> distinct within a process and the Machine ID distinguishes instances.

## API Reference

### ObjectID Function

```typescript ignore
function ObjectID(
  counter?: number,
  machineId?: string,
  machineIdLength?: number,
): () => string;
```

Creates a MongoDB-style ObjectID generator function that produces unique identifiers.

### Parameters

| Parameter         | Type     | Default | Description                                                                                               |
| ----------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `counter`         | `number` | `0`     | Initial counter value for uniqueness (non-negative integer)                                               |
| `machineId`       | `string` | `auto`  | Machine identifier string. Auto-generated if not provided                                                 |
| `machineIdLength` | `number` | `3`     | Length of the auto-generated machine ID (positive integer). Ignored when an explicit `machineId` is given |

**Throws:**

- `InvalidOptionError` - If counter is negative or not an integer (NaN, a
  fractional value, or Infinity)
- `InvalidOptionError` - If machineIdLength is less than 1 or not an integer
  (NaN, a fractional value, or Infinity). Only validated when the machine ID is
  auto-generated; when an explicit `machineId` is provided, `machineIdLength` is
  ignored and therefore not checked

**Returns:** A generator function that produces unique ObjectID strings

## Usage Examples

### Basic Usage

Generate ObjectIDs with default settings:

```typescript
import { ObjectID } from '@tundralibs/id';

// Create an ObjectID generator
const generateId = ObjectID();

// Generate unique IDs
const id1 = generateId();
// => "65a1b2c3019aB30c1f4q000001"

const id2 = generateId();
// => "65a1b2c3019aB30c1f4q000002"

const id3 = generateId();
// => "65a1b2c3019aB30c1f4q000003"
```

### Custom Counter

Start counter at a specific value:

```typescript
import { ObjectID } from '@tundralibs/id';

// Start counter at 1000
const generateId = ObjectID(1000);

const id1 = generateId();
// => "65a1b2c3019aB30c1f4q001001"

const id2 = generateId();
// => "65a1b2c3019aB30c1f4q001002"
```

### Custom Machine ID

Specify a custom machine identifier for distributed systems:

```typescript
import { ObjectID } from '@tundralibs/id';

// Web server instance
const webGen = ObjectID(0, 'web');
const webId = webGen();
// => "65a1b2c3019web0c1f4q000001"

// API server instance
const apiGen = ObjectID(0, 'api');
const apiId = apiGen();
// => "65a1b2c3019api0c1f4q000001"

// Database server instance
const dbGen = ObjectID(0, 'db1');
const dbId = dbGen();
// => "65a1b2c3019db10c1f4q000001"
```

### Distributed Systems

Configure multiple generators across different services:

```typescript
import { ObjectID } from '@tundralibs/id';

// Service A: Customer service
const customerGen = ObjectID(0, 'cust', 4);
const customerId = customerGen();
// => "65a1b2c3019cust0c1f4q000001" (27 chars: 4-char machine ID)

// Service B: Order service
const orderGen = ObjectID(5000, 'ordr', 4);
const orderId = orderGen();
// => "65a1b2c3019ordr0c1f4q005001" (27 chars: 4-char machine ID)

// Service C: Payment service with longer machine ID
const paymentGen = ObjectID(0, 'payment', 7);
const paymentId = paymentGen();
// => "65a1b2c3019payment0c1f4q000001" (30 chars: 7-char machine ID)
```

### Multiple Generators in Same Process

Create isolated generators with independent counters:

```typescript
import { ObjectID } from '@tundralibs/id';

// User ID generator
const userIdGen = ObjectID(0, 'usr');

// Product ID generator
const productIdGen = ObjectID(0, 'prd');

// Order ID generator
const orderIdGen = ObjectID(1000, 'ord');

const userId = userIdGen(); // usr-prefixed counter at 1
const productId = productIdGen(); // prd-prefixed counter at 1
const orderId = orderIdGen(); // ord-prefixed counter at 1001
```

## Timestamp Extraction

Extract the creation timestamp from an ObjectID:

```typescript
import { ObjectID } from '@tundralibs/id';

const generateId = ObjectID();
const id = generateId();
// => "65a1b2c3019aB30c1f4q000001"

// Extract timestamp (first 8 characters, hex seconds)
const timestampHex = id.substring(0, 8);
const timestamp = parseInt(timestampHex, 16);
const date = new Date(timestamp * 1000);

console.log(date.toISOString());
// => "2024-01-12T21:44:35.000Z"

// Extract milliseconds (characters 9-11, decimal 000-999)
const millisStr = id.substring(8, 11);
const millis = parseInt(millisStr, 10);

console.log(`Created at: ${date.toISOString()} + ${millis}ms`);
// => "Created at: 2024-01-12T21:44:35.000Z + 19ms"
```

### Utility Function for Timestamp Extraction

```typescript
import { ObjectID } from '@tundralibs/id';

function extractObjectIdTimestamp(objectId: string): Date {
  // Extract timestamp (seconds)
  const timestampHex = objectId.substring(0, 8);
  const timestamp = parseInt(timestampHex, 16);

  // Extract milliseconds
  const millisStr = objectId.substring(8, 11);
  const millis = parseInt(millisStr, 10);

  // Combine into full date
  return new Date(timestamp * 1000 + millis);
}

// Usage
const generateId = ObjectID();
const id = generateId();
const createdAt = extractObjectIdTimestamp(id);
console.log(createdAt.toISOString());
```

## Use Cases

### 1. Traceable application IDs

Use as an internal document/application identifier when you want an embedded
timestamp and origin (not as a native MongoDB `_id` — see
[Converting to MongoDB](#converting-to-mongodb)):

```typescript
import { ObjectID } from '@tundralibs/id';

declare const collection: { insertOne(doc: unknown): Promise<unknown> };

const generateId = ObjectID();

const document = {
  _id: generateId(),
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date(),
};

await collection.insertOne(document);
```

### 2. Distributed Microservices

Identify records across multiple services:

```typescript
import { ObjectID } from '@tundralibs/id';

// Each microservice has its own generator
const authGen = ObjectID(0, 'auth');
const userGen = ObjectID(0, 'user');
const orderGen = ObjectID(0, 'ordr');

// Generate service-specific IDs
const sessionId = authGen(); // Traceable to auth service
const userId = userGen(); // Traceable to user service
const orderId = orderGen(); // Traceable to order service
```

### 3. Event Tracking

Track events with sortable, unique identifiers:

```typescript
import { ObjectID } from '@tundralibs/id';

const eventGen = ObjectID(0, 'evt');

interface Event {
  id: string;
  type: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

const event: Event = {
  id: eventGen(),
  type: 'user.login',
  timestamp: new Date(),
  data: { userId: '12345' },
};
```

### 4. File Uploads

Generate unique file identifiers:

```typescript
import { ObjectID } from '@tundralibs/id';

declare function saveFile(path: string, file: File): Promise<void>;

const fileGen = ObjectID(0, 'file');

async function uploadFile(file: File) {
  const fileId = fileGen();
  const extension = file.name.split('.').pop();
  const storagePath = `uploads/${fileId}.${extension}`;

  await saveFile(storagePath, file);

  return {
    id: fileId,
    path: storagePath,
    originalName: file.name,
  };
}
```

### 5. Log Correlation

Correlate logs across distributed systems:

```typescript
import { ObjectID } from '@tundralibs/id';

const requestGen = ObjectID(0, 'req');

function logRequest(method: string, path: string) {
  const requestId = requestGen();

  console.log({
    requestId,
    method,
    path,
    timestamp: new Date().toISOString(),
  });

  return requestId; // Pass to downstream services
}
```

## Features

### ✅ Chronologically Sortable

IDs generated later will be lexicographically greater:

```typescript
import { ObjectID } from '@tundralibs/id';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const generateId = ObjectID();

const id1 = generateId();
await sleep(1000); // Wait 1 second
const id2 = generateId();

console.log(id2 > id1); // => true
```

### ✅ Machine and Process Traceable

Identify the origin of each ID:

```typescript
import { ObjectID } from '@tundralibs/id';

// Server 1
const server1Gen = ObjectID(0, 'srv1');
const id1 = server1Gen();
// => "65a1b2c3019srv10c1f4q000001"
//               ^^^^ - Identifies server1

// Server 2
const server2Gen = ObjectID(0, 'srv2');
const id2 = server2Gen();
// => "65a1b2c3019srv20c1f4q000001"
//               ^^^^ - Identifies server2
```

### ✅ Collision Resistant

Multiple safeguards prevent ID collisions:

1. **Timestamp** - Changes every second
2. **Milliseconds** - Sub-second precision
3. **Machine ID** - Unique per machine
4. **Process ID** - Unique per process
5. **Worker ID** - Random collision resistance
6. **Counter** - Sequential within process

```typescript
import { ObjectID } from '@tundralibs/id';

const gen1 = ObjectID();
const gen2 = ObjectID();

// Generate millions of IDs - no collisions
const ids = new Set<string>();
for (let i = 0; i < 1_000_000; i++) {
  ids.add(gen1());
  ids.add(gen2());
}

console.log(ids.size === 2_000_000); // => true (no duplicates)
```

### ✅ Distributed System Safe

Safe to use across multiple machines and processes:

```typescript
import { ObjectID } from '@tundralibs/id';

// Machine A
const machineA = ObjectID(0, 'machA');

// Machine B
const machineB = ObjectID(0, 'machB');

// Machine C
const machineC = ObjectID(0, 'machC');

// All can generate IDs simultaneously without coordination
const idA = machineA(); // Unique
const idB = machineB(); // Unique
const idC = machineC(); // Unique
```

## Best Practices

### 1. Use Consistent Machine IDs

Define machine IDs at application startup:

```typescript
import { ObjectID } from '@tundralibs/id';

// Load from your environment or config (any runtime)
declare const MACHINE_ID: string;
const generateId = ObjectID(0, MACHINE_ID);

export { generateId };
```

### 2. Single Generator Per Process

Create one generator per entity type and reuse it:

```typescript
import { ObjectID } from '@tundralibs/id';

// ✅ Good - Single generator reused
const userIdGen = ObjectID(0, 'usr');

export function createUser() {
  return {
    id: userIdGen(), // Reuse generator
    // ...
  };
}

// ❌ Bad - Creating new generator each time
export function createUserBad() {
  const gen = ObjectID(0, 'usr'); // Creates new generator
  return {
    id: gen(),
    // ...
  };
}
```

### 3. Store as Strings

ObjectIDs are strings, not numbers:

```typescript
import { ObjectID } from '@tundralibs/id';

const generateId = ObjectID();

interface User {
  id: string; // ✅ Correct type
  name: string;
}

const user: User = {
  id: generateId(),
  name: 'John Doe',
};
```

### 4. Index for Performance

Create indexes on ObjectID fields in databases:

```sql
-- PostgreSQL
CREATE INDEX idx_users_id ON users(id);

-- MongoDB automatically indexes _id field
```

### 5. Don't Parse Machine/Process IDs

Treat ObjectIDs as opaque identifiers:

```typescript
// ❌ Bad - Parsing internal structure
function getMachineId(objectId: string) {
  return objectId.substring(11, 14);
}

// ✅ Good - Treat as opaque
function areIdsEqual(id1: string, id2: string): boolean {
  return id1 === id2;
}
```

### 6. Validate Format

Validate ObjectID format when receiving from external sources:

```typescript
declare const requestBody: { id: string };

function isValidObjectId(id: string): boolean {
  // Check length (26 characters)
  if (id.length !== 26) return false;

  // Check if hexadecimal (timestamp) + alphanumeric (rest)
  const timestampPart = id.substring(0, 8);
  if (!/^[0-9a-f]{8}$/i.test(timestampPart)) return false;

  return /^[0-9a-zA-Z]+$/.test(id.substring(8));
}

// Usage
const id = requestBody.id;
if (!isValidObjectId(id)) {
  throw new Error('Invalid ObjectID format');
}
```

## MongoDB Compatibility

ObjectID is **inspired by** MongoDB's ObjectId but is **not** a drop-in replacement — the output is 26 mixed-radix characters, not a 24-char hex BSON ObjectId. Truncate to 24 hex chars before handing it to a MongoDB driver (see [Converting to MongoDB](#converting-to-mongodb)).

### Similarities

✅ MongoDB-style layout (timestamp + machine + process + counter)\
✅ Embedded timestamp\
✅ Machine identifier\
✅ Process identifier\
✅ Incrementing counter\
✅ Chronologically sortable\
✅ Distributed-system safe

### Differences

| Feature          | MongoDB ObjectId  | TundraLibs ObjectID                        |
| ---------------- | ----------------- | ------------------------------------------ |
| **Total Length** | 24 chars          | 26 chars                                   |
| **Timestamp**    | 8 chars (seconds) | 8 chars (seconds) + 3 chars (milliseconds) |
| **Machine ID**   | 3 chars (fixed)   | 3 chars (customizable length)              |
| **Process ID**   | 2 chars           | 4 chars                                    |
| **Counter**      | 3 chars           | 6 chars                                    |
| **Worker ID**    | None              | 2 chars (collision resistance)             |
| **Precision**    | Seconds           | Milliseconds                               |

### Converting to MongoDB

To use with MongoDB, you can adapt the format:

```typescript
import { ObjectID } from '@tundralibs/id';

// Generate TundraLibs ObjectID
const generateId = ObjectID(0, 'srv', 3);
const id = generateId();

// For MongoDB: Use the first 24 characters
const mongoId = id.substring(0, 24);

// Or create a custom generator with MongoDB-compatible length
function MongoCompatibleObjectID() {
  const gen = ObjectID();
  return () => gen().substring(0, 24);
}
```

### Using with MongoDB Drivers

```typescript ignore
import { MongoClient, ObjectId } from 'mongodb';
import { ObjectID } from '@tundralibs/id';

// Option 1: Use MongoDB's ObjectId
const mongoId = new ObjectId();

// Option 2: Use TundraLibs ObjectID (store as string)
const generateId = ObjectID();
const customId = generateId();

await collection.insertOne({
  _id: customId, // Stored as string
  name: 'John Doe',
});
```

---

[← Back to ID Documentation](../README.md)
