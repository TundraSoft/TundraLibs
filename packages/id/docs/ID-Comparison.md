# ID Generator Comparison

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

> **Comprehensive comparison and decision guide for choosing the right ID generator for your use case.**

---

## Table of Contents

1. [Feature Comparison Matrix](#feature-comparison-matrix)
2. [Which ID Should I Use?](#which-id-should-i-use)
3. [Detailed Use Case Recommendations](#detailed-use-case-recommendations)
   - [When to Use NanoID](#when-to-use-nanoid)
   - [When to Use ObjectID](#when-to-use-objectid)
   - [When to Use ULID](#when-to-use-ulid)
   - [When to Use CUID](#when-to-use-cuid)
   - [When to Use CUID2](#when-to-use-cuid2)
   - [When to Use SequenceID](#when-to-use-sequenceid)
   - [When to Use SimpleID](#when-to-use-simpleid)
4. [Performance Comparison](#performance-comparison)
5. [Security Comparison](#security-comparison)
6. [Storage Size Comparison](#storage-size-comparison)
7. [Decision Tree](#decision-tree)
8. [Real-World Examples](#real-world-examples)

---

## Feature Comparison Matrix

| Feature                | NanoID       | ObjectID        | ULID          | CUID            | CUID2             | SequenceID     | SimpleID       |
| ---------------------- | ------------ | --------------- | ------------- | --------------- | ----------------- | -------------- | -------------- |
| **Default Length**     | 21 chars     | 26 chars        | 26 chars      | 25 chars        | 24 chars          | 19 digits      | 12-18 digits   |
| **Format**             | Base62-like  | Mixed-radix     | Base32        | `c` + base36    | Letter + base36   | BigInt         | BigInt         |
| **Sortable**           | ❌ No        | ⚠️ Partial      | ✅ Yes        | ⚠️ Per-process  | ❌ No (by design) | ✅ Yes         | ✅ Yes         |
| **URL-Safe**           | ✅ Yes       | ✅ Yes          | ✅ Yes        | ✅ Yes          | ✅ Yes            | ✅ Yes         | ✅ Yes         |
| **Cryptographic**      | ✅ Yes       | ⚠️ Partial      | ✅ Yes        | ⚠️ Partial      | ✅ Yes            | ❌ No          | ❌ No          |
| **Customizable**       | ✅ High      | ⚠️ Medium       | ❌ Low        | ❌ Fixed        | ⚠️ Length only    | ⚠️ Medium      | ⚠️ Medium      |
| **Timestamp Embedded** | ❌ No        | ✅ Yes          | ✅ Yes        | ✅ Yes          | ❌ No             | ✅ Yes         | ✅ Yes         |
| **Privacy-Preserving** | ✅ Yes       | ❌ Leaks time   | ❌ Leaks time | ❌ Leaks time   | ✅ Yes            | ❌ Leaks time  | ❌ Leaks time  |
| **Human-Readable**     | ⚠️ Partial   | ❌ No           | ⚠️ Partial    | ⚠️ Partial      | ⚠️ Partial        | ⚠️ Partial     | ✅ Yes         |
| **Database-Friendly**  | ✅ Yes       | ✅ Yes          | ✅ Yes        | ✅ Yes          | ✅ Yes            | ✅ Excellent   | ✅ Excellent   |
| **Distributed-Safe**   | ✅ Yes       | ✅ Yes          | ✅ Yes        | ✅ Yes          | ✅ Yes            | ⚠️ Limited     | ⚠️ Limited     |
| **Sequential**         | ❌ No        | ⚠️ Counter only | ⚠️ Time-based | ⚠️ Process-only | ❌ No             | ✅ Yes         | ✅ Yes         |
| **Extract Timestamp**  | ❌ No        | ✅ Yes          | ✅ Yes        | ❌ Not exposed  | ❌ N/A            | ✅ Yes         | ✅ Yes         |
| **Collision Risk**     | Very Low     | Very Low        | Very Low      | Very Low        | Very Low          | Very Low       | Low            |
| **Generation Speed**   | ⚡ Very Fast | ⚡ Fast         | ⚡ Fast       | ⚡ Fast         | ⚡ Fast           | ⚡⚡ Very Fast | ⚡⚡⚡ Fastest |
| **Memory Usage**       | Low          | Medium          | Low           | Low             | Low               | Very Low       | Very Low       |

### Legend

- ✅ **Yes**: Fully supported
- ⚠️ **Partial**: Partially supported or with limitations
- ❌ **No**: Not supported
- ⚡ Performance indicator (more = faster)

---

## Which ID Should I Use?

### Quick Decision Guide

```
┌─────────────────────────────────────────────┐
│     What's your primary requirement?       │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │Compact  │ │Database │ │Sortable │
   │URLs     │ │Primary  │ │by Time  │
   └─────────┘ └─────────┘ └─────────┘
        │           │           │
        ▼           ▼           ▼
    NanoID      SequenceID     ULID
                ObjectID
```

### Scenario-Based Recommendations

#### 🌐 **Public-Facing URLs**

→ **Use NanoID** (21 chars, customizable, URL-safe)

```typescript ignore
// Short, clean URLs
https://app.com/p/g0b30yv24uuo0grjv
```

#### 🗄️ **Database Primary Keys**

→ **Use SequenceID** (64-bit BigInt, indexed efficiently)

```typescript
// Excellent for auto-increment replacement
1234567890123456789n;
```

#### 🍃 **MongoDB Applications**

→ **Use ObjectID** (MongoDB-style traceable IDs — stored as strings, **not**
the native 24-char hex `ObjectId`)

```typescript
// Usable as a string _id field (26-char mixed-radix, not canonical hex)
'65a1b2c3019aB30c1f4q000001';
```

#### 📊 **Distributed Systems**

→ **Use ULID** (sortable, timestamp-based, UUID-compatible)

```typescript
// Time-ordered across multiple servers
'01ARZ3NDEKTSV4RRFFQ69G5FAV';
```

#### 📝 **Human-Readable IDs**

→ **Use SimpleID** (date-based, easy to read)

```typescript
// Invoice or order numbers
202412260001n;
```

#### 🔐 **API Keys / Tokens**

→ **Use NanoID** with custom alphabet (high entropy)

```typescript
import { ALPHA_NUMERIC_CASE, nanoID } from '@tundralibs/id';

// 32-char alphanumeric token
nanoID(32, ALPHA_NUMERIC_CASE);
```

#### ⚡ **High-Performance Scenarios**

→ **Use SimpleID or SequenceID** (minimal overhead)

#### 🔀 **Multi-Region Deployment**

→ **Use ULID or ObjectID** (no coordination needed)

---

## Detailed Use Case Recommendations

### When to Use NanoID

**Best For:**

- Public-facing URLs and shortened links
- API endpoints requiring compact identifiers
- Client-side ID generation (browser-safe)
- Customizable ID formats (alphanumeric, numeric-only)
- External-facing identifiers in REST APIs
- Session identifiers and tracking tokens
- File uploads and temporary resource naming

**Advantages:**

- ✅ **Compact size**: 21 characters (vs 36 for UUID)
- ✅ **URL-safe**: No special encoding needed
- ✅ **Customizable**: Choose alphabet and length
- ✅ **Cryptographically secure**: Uses Web Crypto API
- ✅ **Dependency-light**: only the `@tundralibs/compat` and `@tundralibs/utils` workspace siblings, no third-party runtime deps (CUID needs neither; nanoID/CUID2/ULID pull in only the shared `@tundralibs/utils` error base)
- ✅ **Collision resistant**: ~1 million years to 1% collision probability

**Trade-offs:**

- ❌ Not sortable by creation time
- ❌ No embedded timestamp
- ❌ Cannot extract creation metadata

**Example Use Cases:**

```typescript
import { ALPHA_NUMERIC, nanoID, NUMBERS } from '@tundralibs/id';

// Short URLs
const shortUrl = nanoID(8);
// => "4f90d13a"
// https://app.com/s/4f90d13a

// File uploads
const fileId = nanoID(16);
// => "0gwamxlyi9c0udp2"
// uploads/0gwamxlyi9c0udp2.pdf

// Numeric tracking codes
const trackingCode = nanoID(12, NUMBERS);
// => "123456789012"

// API keys (high security)
const apiKey = nanoID(32, ALPHA_NUMERIC);
// => "4f90d13a42e5f83b7d12c3a8f9b2e6d1"
```

**When NOT to Use:**

- Database primary keys requiring sort order
- Systems requiring timestamp extraction
- Sequential numbering requirements

---

### When to Use ObjectID

**Best For:**

- MongoDB database primary keys
- Distributed systems with MongoDB
- Document-based databases
- Systems requiring embedded timestamp
- Applications needing machine/process identification
- Cross-platform MongoDB compatibility

**Advantages:**

- ✅ **MongoDB-style layout**: Usable as a string `_id` (not the native 24-char hex)
- ✅ **Timestamp embedded**: Extract creation time
- ✅ **Distributed-safe**: No coordination needed
- ✅ **Machine/process identification**: Traceable origin
- ✅ **Incremental counter**: Collision prevention
- ✅ **Industry standard**: Widely recognized format

**Trade-offs:**

- ⚠️ Only partially sortable (second precision)
- ⚠️ Longer than NanoID (26 mixed-radix characters)
- ⚠️ Random component not cryptographically strong

**Example Use Cases:**

```typescript
import { ObjectID } from '@tundralibs/id';

// Document IDs stored as strings (26-char mixed-radix, not canonical hex)
const genId = ObjectID();
const userId = genId();
// => "65a1b2c3019aB30c1f4q000001"

// Distributed system with machine identification
const serverGen = ObjectID(0, 'srv01');
const docId = serverGen();
// => "65a1b2c3019srv010c1f4q000001" (28 chars: 5-char machine ID)

// Microservices with process tracking
const processGen = ObjectID();
const eventId = processGen();
// => "65a1b2c3019aB30c1f4q000002"
```

**When NOT to Use:**

- Non-MongoDB SQL databases (use SequenceID)
- Requiring millisecond-precision sorting
- Public-facing URLs (use NanoID)
- Human-readable requirements (use SimpleID)

---

### When to Use ULID

**Best For:**

- Distributed systems requiring sort order
- Event logging and time-series data
- Microservices architectures
- Replace UUIDs with better sorting
- Multi-region deployments
- High-throughput event streams
- Replacing auto-increment in distributed databases

**Advantages:**

- ✅ **Lexicographically sortable**: Time-ordered
- ✅ **UUID-compatible**: 128-bit like UUID
- ✅ **Millisecond precision**: Accurate timestamps
- ✅ **Monotonic variant**: Guaranteed ordering
- ✅ **Crockford Base32**: No ambiguous characters
- ✅ **1.21e+24 unique IDs**: Per millisecond
- ✅ **Extract timestamp**: Recoverable creation time

**Trade-offs:**

- ⚠️ Longer than NanoID (26 characters)
- ⚠️ Not customizable (fixed format)
- ⚠️ Slightly slower generation than SequenceID

**Example Use Cases:**

```typescript
import { getTimestamp, monotonicUlid, ulid } from '@tundralibs/id';

// Event logging (sortable by time)
const eventId = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"

// Guaranteed ordering in same millisecond
const event1 = monotonicUlid();
const event2 = monotonicUlid();
// event2 > event1 always

// Time-series data
const dataPoints = Array.from({ length: 1000 }, () => ({
  id: ulid(),
  value: Math.random(),
}));
// Automatically sorted by creation time

// Extract creation timestamp
const id = ulid();
const createdAt = getTimestamp(id);
// => 1628000000000 (milliseconds)

// Distributed logs across regions
const logId = ulid();
// Maintains global time order
```

**When NOT to Use:**

- Need extreme compactness (use NanoID)
- Custom alphabet requirements
- Pure sequential integers (use SequenceID)
- Daily reset requirements (use SimpleID)

---

### When to Use CUID

**Best For:**

- Migrations from ParallelDrive's original CUID convention.
- Process-local sortable identifiers that need a recognisable `c` prefix.
- Mixed-environment apps that benefit from a self-identifying ID format.

**Advantages:**

- ✅ **`c` prefix**: Self-identifying — distinguishes CUIDs from raw base36 strings.
- ✅ **Process-sortable**: Timestamp + counter give in-process ordering for free.
- ✅ **Compact**: 25 chars, URL- and shell-safe.
- ✅ **Cross-process disambiguation**: Per-process fingerprint segment.

**Example:**

```typescript
import { cuid } from '@tundralibs/id';

const userId = cuid();
// => 'clrwk6yt40001qz2ek6f7r2t1'
```

**When NOT to Use:**

- The ID is shown to attackers and minting time must stay private → use CUID2.
- Need cross-machine sortability → use ULID.
- Need MongoDB-native IDs → use ObjectID.

---

### When to Use CUID2

**Best For:**

- **Public-facing tokens** (magic links, password reset, email verification).
- **Privacy-sensitive IDs** where the minting time must not leak.
- Anywhere CUID2's lack of timestamp removes a side-channel without
  costing you anything you actually need.

**Advantages:**

- ✅ **No information leakage**: No embedded timestamp, counter, or fingerprint.
- ✅ **Cryptographically secure**: Entire body sourced from `crypto.getRandomValues`.
- ✅ **Configurable length**: 24..32 chars to tune collision resistance.
- ✅ **URL-safe**: Lowercase alphanumeric only.

**Example:**

```typescript
import { cuid2 } from '@tundralibs/id';

const resetToken = cuid2(32);
// => 'k3rj9xn8q1p7m2w5y6h4t8d9a2b3c4d5'
```

**When NOT to Use:**

- You need sortability (use ULID or CUID).
- You need a fixed length that matches an existing schema (use NanoID with the
  exact length you want).

---

### When to Use SequenceID

**Best For:**

- Database primary keys (auto-increment replacement, single-producer)
- High-performance SQL databases
- Sequential ordering requirements
- Indexed columns (B-tree friendly)
- Legacy system migration from auto-increment

**Advantages:**

- ✅ **64-bit BigInt**: Native database support
- ✅ **Sequential**: Optimal for B-tree indexes
- ✅ **Timestamp embedded**: Extractable creation time
- ✅ **Extremely fast**: Minimal overhead
- ✅ **Memory efficient**: No string allocation
- ✅ **Database-optimized**: Integer indexing

**Trade-offs:**

- ⚠️ **Caller singleton required**: two `sequenceID()` instances in the same process at the same startup-second produce identical IDs. Instantiate once per logical sequence at module scope and share the returned function.
- ⚠️ **Limited cross-process safety**: distinct processes are discriminated only by `(PID % 256, startup_second)`. Two processes with colliding PID residue starting in the same second will produce overlapping IDs.
- ⚠️ **Not cryptographically secure**: contents are predictable from server-state.
- ⚠️ **Less human-readable than SimpleID**.

**Example Use Cases:**

```typescript
import { sequenceID } from '@tundralibs/id';

// Create the generator ONCE per logical sequence at module scope.
const genUserId = sequenceID();

// Database primary keys
const userId = genUserId();
// => 1234567890123456789n

// Bulk insert reuses the same generator
const users = Array.from({ length: 10000 }, (_, i) => ({
  id: genUserId(),
  name: `User ${i}`,
}));
```

**When NOT to Use:**

- Public URLs (use NanoID).
- Distributed deployments where multiple nodes may share `PID % 256` (use ULID or ObjectID).
- Workloads emitting more than ~16M IDs per startup-second per generator (use ULID).
- Anywhere unpredictability of the ID matters for security.

---

### When to Use SimpleID

**Best For:**

- Invoice numbering systems
- Order numbers
- Daily sequential IDs
- Human-readable identifiers
- Date-traceable records
- Receipt numbers
- Ticket systems
- Reference numbers

**Advantages:**

- ✅ **Human-readable**: Date + counter format
- ✅ **Date-based**: YYYYMMDDNNNN structure
- ✅ **Auto-reset**: Counter resets daily
- ✅ **Predictable**: Sequential within day
- ✅ **Simple**: Minimal complexity
- ✅ **Customizable**: Configurable counter length
- ✅ **Fastest**: Minimal overhead

**Trade-offs:**

- ❌ Not suitable for distributed systems
- ❌ Limited uniqueness (daily counter)
- ❌ No cryptographic security
- ❌ Predictable sequence

**Example Use Cases:**

```typescript
import { simpleID } from '@tundralibs/id';

// Invoice numbers
const invoiceGen = simpleID(0, 6);
const invoice = invoiceGen();
// => 20241226000001n
// Display: INV-2024-12-26-000001

// Order numbers
const orderGen = simpleID();
const orderId = orderGen();
// => 202412260001n
// Display: ORD-20241226-0001

// Daily ticket numbers
const ticketGen = simpleID();
const ticket1 = ticketGen(); // 202412260001n
const ticket2 = ticketGen(); // 202412260002n
// Resets at midnight

// Receipt numbers
const receiptGen = simpleID(0, 4);
const receiptId = receiptGen();
// => 202412260001n

// Reference tracking with microseconds
const preciseGen = simpleID(0, 4, true);
const refId = preciseGen();
// => 20241226123456789012n
```

**When NOT to Use:**

- High-security requirements
- Distributed/multi-server systems
- Non-sequential requirements
- Public-facing identifiers
- Systems requiring cryptographic guarantees

---

## Performance Comparison

### Generation Speed Benchmarks

> Based on Deno benchmarks (operations per second, higher is better)

| Generator   | Ops/sec (approx) | Relative Speed | Use Case        |
| ----------- | ---------------- | -------------- | --------------- |
| SimpleID    | ~5,000,000       | ⚡⚡⚡ Fastest | Maximum speed   |
| SequenceID  | ~4,500,000       | ⚡⚡⚡ Fastest | Database keys   |
| NanoID (10) | ~2,000,000       | ⚡⚡ Very Fast | Compact IDs     |
| NanoID (21) | ~1,500,000       | ⚡⚡ Very Fast | Default length  |
| ObjectID    | ~1,200,000       | ⚡ Fast        | MongoDB         |
| ULID        | ~1,000,000       | ⚡ Fast        | Sortable IDs    |
| Monotonic   | ~900,000         | ⚡ Fast        | Strict ordering |

### Performance Characteristics

#### 🏆 **Fastest (5M+ ops/sec)**

- **SimpleID**: Minimal computation (date + counter)
- **SequenceID**: Simple BigInt operations
- **Best for**: High-throughput systems, real-time applications

#### ⚡ **Very Fast (1-2M ops/sec)**

- **NanoID**: Crypto random with optimized buffer
- **Best for**: Balanced performance and security

#### 🔧 **Fast (900K-1.2M ops/sec)**

- **ObjectID**: Multiple components assembly
- **ULID**: Base32 encoding overhead
- **Monotonic ULID**: State tracking
- **Best for**: Most applications (still very fast)

### Memory Usage

| Generator  | Memory per ID | Garbage Collection Impact |
| ---------- | ------------- | ------------------------- |
| SequenceID | ~8 bytes      | ⭐⭐⭐ Minimal            |
| SimpleID   | ~8 bytes      | ⭐⭐⭐ Minimal            |
| NanoID     | ~21 bytes     | ⭐⭐ Low                  |
| ObjectID   | ~24 bytes     | ⭐⭐ Low                  |
| ULID       | ~26 bytes     | ⭐⭐ Low                  |

### Scalability Considerations

```typescript
// High-throughput scenario (100K IDs/sec)
// ✅ All generators handle this easily

// Extreme throughput (1M+ IDs/sec)
// ✅ SimpleID, SequenceID (best)
// ✅ NanoID (excellent)
// ⚠️ ObjectID, ULID (good, may need optimization)

// Distributed generation (multiple servers)
// ✅ ULID, ObjectID, NanoID (no coordination)
// ⚠️ SequenceID (server-specific)
// ❌ SimpleID (not recommended)
```

---

## Security Comparison

### Cryptographic Strength

| Generator  | Entropy Source            | Predictability | Brute Force Resistance | Recommended for Security |
| ---------- | ------------------------- | -------------- | ---------------------- | ------------------------ |
| NanoID     | Web Crypto API            | Unpredictable  | ⭐⭐⭐⭐⭐ Excellent   | ✅ Yes                   |
| ULID       | Crypto Random             | Unpredictable  | ⭐⭐⭐⭐⭐ Excellent   | ✅ Yes                   |
| ObjectID   | Crypto + Counter          | Semi-predict   | ⭐⭐⭐⭐ Very Good     | ⚠️ With care             |
| SequenceID | Time + ServerID + Counter | Semi-predict   | ⭐⭐⭐ Good            | ⚠️ Not for auth          |
| SimpleID   | Sequential Counter        | Predictable    | ⭐ Poor                | ❌ No                    |

### Security Use Cases

#### 🔒 **High Security (API Keys, Tokens, Secrets)**

```typescript
// Use NanoID with maximum length
import { ALPHA_NUMERIC_CASE, nanoID } from '@tundralibs/id';

const apiKey = nanoID(32, ALPHA_NUMERIC_CASE);
// 62^32 = 2.27 x 10^57 combinations
```

**Recommendations:**

- ✅ NanoID (32+ characters)
- ✅ ULID (128-bit entropy)
- ❌ Never use SimpleID or SequenceID

#### 🛡️ **Medium Security (Session IDs, Resource IDs)**

```typescript
import { nanoID, ulid } from '@tundralibs/id';

// NanoID or ULID work well
const sessionId = nanoID(); // 21 chars
const resourceId = ulid(); // 26 chars
```

**Recommendations:**

- ✅ NanoID (default 21 chars)
- ✅ ULID
- ⚠️ ObjectID (acceptable)

#### 📊 **Low Security (Internal IDs, Database Keys)**

```typescript
import { sequenceID, simpleID } from '@tundralibs/id';

// Any generator is suitable
const userId = sequenceID()();
const orderId = simpleID()();
```

**Recommendations:**

- ✅ All generators acceptable
- Choose based on performance/features

### Collision Probability

```typescript
// NanoID (21 chars, 64 alphabet)
// ~265 years needed to have 1% probability of collision
// at 1,000 IDs per hour

// ULID (128-bit)
// ~2.5 x 10^18 IDs before 50% collision probability

// ObjectID (counter + random)
// ~16 million IDs per second before collision risk

// SequenceID (counter-based)
// No collisions within same server instance

// SimpleID (date + counter)
// No collisions within same day per instance
```

---

## Storage Size Comparison

### String Storage

| Generator  | String Length | Bytes (UTF-8) | Database VARCHAR Size |
| ---------- | ------------- | ------------- | --------------------- |
| NanoID     | 21 chars      | 21 bytes      | VARCHAR(21)           |
| ObjectID   | 26 chars      | 26 bytes      | VARCHAR(26) or BINARY |
| ULID       | 26 chars      | 26 bytes      | VARCHAR(26)           |
| SequenceID | 19 digits     | 8 bytes       | BIGINT                |
| SimpleID   | 12-18 digits  | 8 bytes       | BIGINT                |

### Database Storage Efficiency

#### PostgreSQL

```sql
-- String-based IDs
CREATE TABLE users_nano (
  id VARCHAR(21) PRIMARY KEY,  -- 21 bytes + overhead
  name VARCHAR(100)
);

CREATE TABLE users_ulid (
  id VARCHAR(26) PRIMARY KEY,  -- 26 bytes + overhead
  name VARCHAR(100)
);

-- Integer-based IDs (most efficient)
CREATE TABLE users_seq (
  id BIGINT PRIMARY KEY,        -- 8 bytes, indexed efficiently
  name VARCHAR(100)
);

-- Storage for 1M records:
-- NanoID:     ~21 MB (id only)
-- ULID:       ~26 MB (id only)
-- SequenceID: ~8 MB (id only)
```

#### MongoDB

```typescript ignore
// ObjectID (native format)
{
  _id: ObjectId("507f1f77bcf86cd799439011"), // 12 bytes (binary)
  name: "John"
}

// String IDs
{
  _id: "g0b30yv24uuo0grjvi6su", // 21 bytes + overhead
  name: "John"
}

// Storage for 1M documents:
// ObjectID:   ~12 MB (id only)
// NanoID:     ~21 MB (id only)
// ULID:       ~26 MB (id only)
```

### Index Size Impact

| Generator  | Index Size (1M rows) | Index Fragmentation | Insertion Performance |
| ---------- | -------------------- | ------------------- | --------------------- |
| SequenceID | ~8 MB                | ⭐⭐⭐ Minimal      | ⭐⭐⭐ Excellent      |
| SimpleID   | ~8 MB                | ⭐⭐⭐ Minimal      | ⭐⭐⭐ Excellent      |
| ULID       | ~26 MB               | ⭐⭐ Low            | ⭐⭐ Very Good        |
| ObjectID   | ~24 MB               | ⭐⭐ Low            | ⭐⭐ Very Good        |
| NanoID     | ~21 MB               | ⭐ High             | ⭐ Good               |

**Key Insight**: Sequential IDs (SequenceID, SimpleID) have the smallest index footprint and best insertion performance due to B-tree efficiency.

---

## Decision Tree

### Text-Based Decision Flow

```
START: Choose an ID Generator
│
├─ Question 1: Is this for a public-facing URL or API?
│  ├─ YES → Question 2: Do you need it to be very compact?
│  │  ├─ YES → Use NanoID (customizable length)
│  │  └─ NO  → Use ULID (sortable + unique)
│  │
│  └─ NO  → Question 3: What's your database?
│     ├─ MongoDB → Use ObjectID (native compatibility)
│     │
│     ├─ SQL Database → Question 4: Need time-based sorting?
│     │  ├─ YES → Question 5: Distributed system?
│     │  │  ├─ YES → Use ULID (distributed + sortable)
│     │  │  └─ NO  → Use SequenceID (fastest + indexed)
│     │  │
│     │  └─ NO → Question 6: Human-readable needed?
│     │     ├─ YES → Use SimpleID (date-based)
│     │     └─ NO  → Use SequenceID (performance)
│     │
│     └─ Other/NoSQL → Question 7: Need sorting by time?
│        ├─ YES → Use ULID (universal compatibility)
│        └─ NO  → Use NanoID (compact + flexible)
```

### Flowchart Visualization

```
                    ┌─────────────────┐
                    │  Start: Choose  │
                    │   ID Generator  │
                    └────────┬────────┘
                             │
                    ┌────────▼─────────┐
                    │  Public-facing   │
                    │   URL or API?    │
                    └────┬──────┬──────┘
                    YES  │      │  NO
              ┌──────────┘      └──────────┐
              │                             │
     ┌────────▼─────────┐         ┌────────▼─────────┐
     │  Need compact?   │         │  Database type?  │
     └────┬──────┬──────┘         └────┬──────┬──────┘
     YES  │      │  NO            Mongo│      │  SQL
  ┌───────┘      └────────┐      ┌─────┘      └─────┐
  │                       │      │                   │
  ▼                       ▼      ▼                   ▼
┌─────────┐         ┌─────────┐ ┌────────┐    ┌──────────┐
│ NanoID  │         │  ULID   │ │ObjectID│    │Sortable? │
│ 8-21ch  │         │ Sortable│ │ Native │    └────┬─────┘
└─────────┘         └─────────┘ └────────┘    YES  │  NO
                                             ┌──────┘  └────┐
                                             ▼              ▼
                                        ┌─────────┐  ┌──────────┐
                                        │  ULID   │  │SimpleID/ │
                                        │Sequential│  │SequenceID│
                                        └─────────┘  └──────────┘
```

### Priority-Based Selection

#### Priority 1: Performance

1. SimpleID (fastest)
2. SequenceID
3. NanoID

#### Priority 2: Sortability

1. ULID (millisecond precision)
2. SequenceID (sequential)
3. SimpleID (date-based)

#### Priority 3: Compactness

1. NanoID (customizable)
2. SequenceID (8 bytes)
3. ObjectID

#### Priority 4: Security

1. NanoID (32+ chars)
2. ULID (128-bit)
3. ObjectID

#### Priority 5: Simplicity

1. SimpleID
2. NanoID
3. SequenceID

---

## Real-World Examples

### Example 1: E-Commerce Platform

**Requirement**: Multi-tenant e-commerce with products, orders, and users.

```typescript
import { nanoID, ObjectID, simpleID } from '@tundralibs/id';

// User IDs: string primary keys with an embedded timestamp
const userIdGen = ObjectID();
const userId = userIdGen();
// => "65a1b2c3019aB30c1f4q000001"

// Product SKUs: Short, URL-safe
const productSku = nanoID(10);
// => "ridvgi_4p7"
// URL: /products/ridvgi_4p7

// Order Numbers: Human-readable
const orderGen = simpleID(0, 6);
const orderNumber = orderGen();
// => 20241226000001n
// Display: ORD-2024-12-26-000001
```

### Example 2: Microservices Architecture

**Requirement**: Distributed logging, event tracking, and service-to-service communication.

```typescript
import { ObjectID, ulid } from '@tundralibs/id';

// Request IDs: Sortable across services
const requestId = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"
// Maintains order across regions

// Event IDs: Monotonic ordering
import { monotonicUlid } from '@tundralibs/id';
const event1 = monotonicUlid();
const event2 = monotonicUlid();
// Guaranteed: event2 > event1

// Service Instance IDs
const serviceIdGen = ObjectID(0, 'api-gateway');
const instanceId = serviceIdGen();
// => "65a1b2c3019api-gateway0c1f4q000001" (34 chars: 11-char machine ID)
```

### Example 3: SaaS Application

**Requirement**: Multi-tenant platform with workspaces, projects, and tasks.

```typescript
import { nanoID, sequenceID, ulid } from '@tundralibs/id';

// Workspace Slug: User-friendly URLs
const workspaceId = nanoID(8);
// => "4f90d13a"
// URL: app.com/w/4f90d13a

// Project IDs: Database primary keys
const projectIdGen = sequenceID();
const projectId = projectIdGen();
// => 1234567890123456789n

// Task IDs: Sortable by creation
const taskId = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

### Example 4: API Authentication

**Requirement**: Secure API keys and session tokens.

```typescript
import { ALPHA_NUMERIC_CASE, nanoID } from '@tundralibs/id';

// API Keys: High entropy
const apiKey = `sk_live_${nanoID(32, ALPHA_NUMERIC_CASE)}`;
// => "sk_live_<random 32-char ALPHA_NUMERIC_CASE nanoID>"

// Session Tokens: Standard length
const sessionToken = nanoID();
// => "g0b30yv24uuo0grjvi6su"

// Refresh Tokens: Maximum security
const refreshToken = nanoID(48, ALPHA_NUMERIC_CASE);
// => "4f90d13a42e5f83b7d12c3a8f9b2e6d1a5c7f8b9d0e1f2a3b4c5"
```

### Example 5: Content Management System

**Requirement**: Articles, media assets, and revisions.

```typescript
import { nanoID, ObjectID, ulid } from '@tundralibs/id';

// Article IDs: traceable string document IDs
const articleIdGen = ObjectID();
const articleId = articleIdGen();
// => "65a1b2c3019aB30c1f4q000001"

// Media Asset IDs: Short URLs
const assetId = nanoID(12);
// => "57lvfwtpxx9g"
// CDN URL: cdn.example.com/i/57lvfwtpxx9g.jpg

// Revision IDs: Sortable timeline
const revisionId = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"
// Automatically ordered by time
```

### Example 6: IoT Device Management

**Requirement**: Device registration, telemetry, and command tracking.

```typescript
import { ObjectID, sequenceID, ulid } from '@tundralibs/id';

// Device IDs: Unique hardware identifiers
const deviceIdGen = ObjectID(0, 'factory-01');
const deviceId = deviceIdGen();
// => "65a1b2c3019factory-010c1f4q000001" (33 chars: 10-char machine ID)

// Telemetry Events: Time-ordered
const telemetryId = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"

// Command IDs: Sequential tracking
const commandSeq = sequenceID();
const commandId = commandSeq();
// => 1234567890123456789n
```

### Example 7: Financial System

**Requirement**: Transactions, invoices, and audit trails.

```typescript
import { sequenceID, simpleID, ulid } from '@tundralibs/id';

// Transaction IDs: Sequential + traceable
const txnGen = sequenceID();
const transactionId = txnGen();
// => 1234567890123456789n

// Invoice Numbers: Human-readable
const invoiceGen = simpleID(0, 6);
const invoiceNumber = invoiceGen();
// => 20241226000001n
// Display: INV-2024-12-26-000001

// Audit Log IDs: Sortable + immutable
const auditId = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

---

## Summary Matrix

| Use Case              | Recommended  | Alternative | Avoid    |
| --------------------- | ------------ | ----------- | -------- |
| Public URLs           | NanoID       | ULID        | SimpleID |
| Database Primary Keys | SequenceID   | ObjectID    | SimpleID |
| MongoDB               | ObjectID     | ULID        | -        |
| Distributed Systems   | ULID         | ObjectID    | SimpleID |
| Sequential Ordering   | SequenceID   | ULID        | NanoID   |
| Human-Readable        | SimpleID     | -           | ULID     |
| API Keys              | NanoID (32+) | ULID        | SimpleID |
| Event Logging         | ULID         | ObjectID    | SimpleID |
| High Performance      | SimpleID     | SequenceID  | -        |
| Time-Series Data      | ULID         | SequenceID  | NanoID   |

---

## Conclusion

Choose your ID generator based on your specific requirements:

- **Compact & Flexible**: NanoID
- **MongoDB Native**: ObjectID
- **Sortable & Distributed**: ULID
- **High Performance**: SequenceID
- **Human-Readable**: SimpleID

All generators are production-ready, well-tested, and optimized for their respective use cases.

---

[← Back to ID Documentation](../README.md)
