# SimpleID

Human-readable date-based sequential ID generator for business documents and daily sequences.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [ID Structure](#id-structure)
  - [Basic Format](#basic-format)
  - [With Microseconds](#with-microseconds)
  - [Format Variations](#format-variations)
- [API Reference](#api-reference)
  - [simpleID()](#simpleid)
  - [Parameters](#parameters)
- [Usage Examples](#usage-examples)
  - [Basic Daily Sequence](#basic-daily-sequence)
  - [Invoice Numbers](#invoice-numbers)
  - [Order Numbers](#order-numbers)
  - [High-Precision Timestamps](#high-precision-timestamps)
  - [Custom Starting Value](#custom-starting-value)
- [Automatic Daily Reset](#automatic-daily-reset)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Comparison with Other Sequential Systems](#comparison-with-other-sequential-systems)
- [Related Documentation](#related-documentation)

## Overview

SimpleID generates human-readable sequential IDs that combine the current date with an incrementing counter. These IDs are perfect for business documents, invoices, orders, and any scenario where you need date-traceable, predictable identifiers that are easy to read and understand.

**Why SimpleID?**

- **Human-readable**: Date component makes IDs immediately understandable
- **Predictable**: Sequential counters provide ordered, traceable sequences
- **Date-sortable**: IDs naturally sort chronologically by date
- **Business-friendly**: Perfect for invoices, receipts, and documents
- **Automatic reset**: Counter resets daily for clean daily sequences
- **Customizable**: Adjust counter length and precision to your needs

## Features

| Feature               | Support | Description                                    |
| --------------------- | ------- | ---------------------------------------------- |
| Date-based            | ✅      | YYYYMMDD format for immediate date recognition |
| Sequential Counter    | ✅      | Incrementing counter with customizable length  |
| Daily Reset           | ✅      | Counter automatically resets at midnight       |
| Microsecond Precision | ✅      | Optional high-precision timestamps             |
| BigInt Output         | ✅      | Native BigInt for large numbers and precision  |
| Zero-padded           | ✅      | Consistent length for sorting and alignment    |
| Custom Seed           | ✅      | Start sequences at any number                  |
| Runtime Agnostic      | ✅      | Works on Deno, Bun, and Node.js                |

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
import { simpleID } from 'jsr:@tundralibs/id';
```

## ID Structure

### Basic Format

The basic SimpleID format combines date and counter:

```
YYYYMMDD + NNNN
└─┬──┘   └─┬─┘
  │        └─ Counter (zero-padded, customizable length)
  └────────── Date (8 digits)
```

**Example:** `202412260042` breaks down as:

- `20241226` - December 26, 2024
- `0042` - 42nd ID of the day

### With Microseconds

When microsecond precision is enabled, the format includes timestamp:

```
YYYYMMDD + ΜΜΜΜΜΜ + NNN
└─┬──┘   └──┬───┘ └┬┘
  │         │      └─ Counter (3+ digits)
  │         └──────── Microseconds (6 digits)
  └────────────────── Date (8 digits)
```

**Example:** `20241226143052000123` breaks down as:

- `20241226` - December 26, 2024
- `143052` - Microsecond timestamp component
- `000123` - 123rd ID

### Format Variations

Different configurations produce different ID formats:

| Configuration     | Format            | Example             | Use Case           |
| ----------------- | ----------------- | ------------------- | ------------------ |
| Default           | YYYYMMDDNNNN      | `202412260001`      | Daily sequences    |
| Custom length     | YYYYMMDDNNNNNN    | `20241226000001`    | High-volume orders |
| With microseconds | YYYYMMDDΜΜΜΜΜΜNNN | `20241226143052001` | Event logging      |
| Custom seed       | YYYYMMDDNNNN      | `202412261001`      | Invoice numbering  |

## API Reference

### simpleID()

Creates a date-based sequential ID generator function.

```typescript
function simpleID(
  seed?: number,
  minLen?: number,
  includeMicroseconds?: boolean,
): () => bigint;
```

**Parameters:**

- `seed` - _Optional_. Initial counter value (default: `0`)
  - Starting number for the sequence
  - Useful for continuing existing sequences
  - Must be a non-negative integer (negative integers are clamped to 0; NaN,
    fractional, or Infinite values throw `InvalidOptionError`)
  - Example: Set to `1000` to start invoices at INV-202412261001

- `minLen` - _Optional_. Minimum length of the counter component (default: `4`)
  - Counter is zero-padded to this length
  - Must be an integer between 1 and 256
  - The upper bound of `256` is a deliberate sanity cap, not a technical
    maximum: it sits far below every runtime's real failure point (a padded
    counter that overflows the engine's string length, or a BigInt too large to
    build), while `10^256` IDs in a single day is already beyond astronomical.
    Values above `256` are rejected on purpose so the typed `InvalidOptionError`
    is raised at construction on every runtime, rather than a raw `RangeError`
    surfacing later at generation time.
  - Longer values prevent overflow in high-volume scenarios
  - Example: `6` produces counters like `000001`, `000002`

- `includeMicroseconds` - _Optional_. Whether to include microsecond precision (default: `false`)
  - Adds 6-digit microsecond component to IDs
  - Provides higher uniqueness for rapid generation
  - Useful for event logging and high-frequency operations
  - Increases ID length significantly

**Returns:** `() => bigint` - A generator function that produces sequential IDs

**Throws:**

- `InvalidOptionError` - If `minLen` is less than 1, greater than 256, or not an
  integer (NaN, a fractional value, or Infinity). A NaN or fractional `minLen`
  is **not** silently accepted (which would emit a below-minimum counter), and
  an out-of-range value throws this typed error rather than a raw `RangeError`
  at generation time.
- `InvalidOptionError` - If `seed` is not an integer (NaN, a fractional value,
  or Infinity)

**Generator Function:**

The returned function generates the next ID in sequence:

```typescript
const gen = simpleID();
const id1 = gen(); // 202412260001n
const id2 = gen(); // 202412260002n
```

## Usage Examples

### Basic Daily Sequence

Simple incrementing sequence that resets daily:

```typescript
import { simpleID } from '@tundralibs/id';

const dailySeq = simpleID();

const id1 = dailySeq(); // 202412260001n
const id2 = dailySeq(); // 202412260002n
const id3 = dailySeq(); // 202412260003n

// Next day, counter automatically resets
// (assuming date has changed)
const nextDayId = dailySeq(); // 202412270001n
```

### Invoice Numbers

Generate professional invoice numbers with custom prefix:

```typescript
import { simpleID } from '@tundralibs/id';

// Start at 1000 for professional appearance
const invoiceGen = simpleID(1000, 4);

const inv1 = invoiceGen(); // 202412261001n
const inv2 = invoiceGen(); // 202412261002n

// Format with prefix for display
const formatInvoice = (id: bigint) => `INV-${id}`;

console.log(formatInvoice(inv1)); // "INV-202412261001"
console.log(formatInvoice(inv2)); // "INV-202412261002"
```

### Order Numbers

High-volume order tracking with longer counters:

```typescript
import { simpleID } from '@tundralibs/id';

// 6-digit counter for high-volume businesses
const orderGen = simpleID(0, 6);

const order1 = orderGen(); // 20241226000001n
const order2 = orderGen(); // 20241226000002n
const order3 = orderGen(); // 20241226000003n

// Format for display
const formatOrder = (id: bigint) => `ORD-${id}`;

console.log(formatOrder(order1)); // "ORD-20241226000001"
```

### High-Precision Timestamps

Event logging with microsecond accuracy:

```typescript
import { simpleID } from '@tundralibs/id';

// Include microseconds for precision
const logGen = simpleID(0, 3, true);

const log1 = logGen(); // 20241226143052789001n
const log2 = logGen(); // 20241226143052789002n
const log3 = logGen(); // 20241226143052790001n

// Parse components for display
const parseLogId = (id: bigint) => {
  const str = id.toString();
  return {
    date: str.slice(0, 8), // 20241226
    micro: str.slice(8, 14), // 143052
    counter: str.slice(14), // 789001
  };
};

console.log(parseLogId(log1));
// { date: '20241226', micro: '143052', counter: '789001' }
```

### Custom Starting Value

Continue sequences from a specific number:

```typescript
import { simpleID } from '@tundralibs/id';

// Resume from last known ID
const lastId = 5432;
const resumeGen = simpleID(lastId, 4);

const next1 = resumeGen(); // 202412265433n
const next2 = resumeGen(); // 202412265434n
```

## Automatic Daily Reset

SimpleID automatically resets the counter to zero at the start of each new day. This ensures:

1. **Predictable daily sequences**: Each new day starts fresh at `0001` (the counter resets to 0, so the first ID of the day is `YYYYMMDD0001` regardless of the seed)
2. **Date-based organization**: IDs are naturally grouped by date
3. **Consistent length**: Counter stays within expected ranges
4. **No manual intervention**: Reset happens automatically

**How it works:**

The generator tracks the current date (YYYYMMDD format) and compares it on each ID generation:

```typescript
const gen = simpleID(0, 4);

// December 26, 2024
const id1 = gen(); // 202412260001n
const id2 = gen(); // 202412260002n

// ... time passes, date changes to December 27 ...

// December 27, 2024 - counter automatically reset
const id3 = gen(); // 202412270001n (counter reset to 1)
const id4 = gen(); // 202412270002n
```

**Important notes:**

- Reset occurs on first ID generation after midnight
- Counter resets to zero, **not** the initial seed. The seed only offsets the
  first day's sequence; every new day begins at `YYYYMMDD0001` regardless of seed
- No IDs are lost during reset
- Works across time zones (uses system time)

## Use Cases

SimpleID is ideal for scenarios requiring human-readable, date-traceable identifiers:

### Business Documents

Perfect for invoices, receipts, quotes, and purchase orders:

```typescript
const invoiceGen = simpleID(1000, 4);
const receiptGen = simpleID(5000, 4);
const quoteGen = simpleID(2000, 4);

// Generate daily document numbers
const invoice = invoiceGen(); // INV-202412261001
const receipt = receiptGen(); // RCP-202412265001
const quote = quoteGen(); // QTE-202412262001
```

### Order Management

Track orders with date-based references:

```typescript
const orderGen = simpleID(0, 6);

// Orders are naturally sorted by date
const order1 = orderGen(); // 20241226000001
const order2 = orderGen(); // 20241226000002
```

### Ticket Systems

Generate support tickets or event tickets:

```typescript
const ticketGen = simpleID(10000, 5);

// Support tickets
const ticket1 = ticketGen(); // TKT-2024122610001
const ticket2 = ticketGen(); // TKT-2024122610002
```

### Event Logging

High-frequency log entries with microsecond precision:

```typescript
const logGen = simpleID(0, 3, true);

// Precise event timestamps
const event1 = logGen(); // 20241226143052789001
const event2 = logGen(); // 20241226143052789002
```

### Daily Reports

Generate daily report identifiers:

```typescript
const reportGen = simpleID(1, 3);

// Daily report numbering
const report1 = reportGen(); // RPT-20241226002
const report2 = reportGen(); // RPT-20241226003
```

## Best Practices

### Choose Appropriate Counter Length

Select `minLen` based on expected daily volume:

- **4 digits** (0001-9999): Up to ~10,000 IDs per day
- **5 digits** (00001-99999): Up to ~100,000 IDs per day
- **6 digits** (000001-999999): Up to ~1,000,000 IDs per day

```typescript
// Low volume (< 10K/day)
const lowVol = simpleID(0, 4);

// Medium volume (< 100K/day)
const medVol = simpleID(0, 5);

// High volume (< 1M/day)
const highVol = simpleID(0, 6);
```

### Use Appropriate Seeds

Start sequences at meaningful numbers:

```typescript
// Start at 1 for natural counting
const natural = simpleID(1, 4);

// Start at 1000 for professional appearance
const professional = simpleID(1000, 4);

// Start at 10000 to match legacy systems
const legacy = simpleID(10000, 5);
```

### Format for Display

Add prefixes and separators for better readability:

```typescript
const gen = simpleID(1000, 4);
const id = gen();

// Add prefix
const withPrefix = `INV-${id}`;

// Add separators for readability
const formatted = id.toString().replace(
  /(\d{8})(\d+)/,
  '$1-$2',
);
// 20241226-1001
```

### Store as BigInt

Keep IDs as BigInt in databases for efficient sorting and indexing:

```typescript
// PostgreSQL
CREATE TABLE invoices (
  id BIGINT PRIMARY KEY,
  amount DECIMAL(10,2)
);

// MongoDB
{
  _id: ObjectId(),
  invoiceId: Long("202412261001"),
  amount: 100.00
}
```

### Consider Timezone

Be aware that daily reset uses system time:

```typescript
// Explicit timezone handling if needed
const getDateInTz = (tz: string) => {
  return new Date().toLocaleString('en-US', { timeZone: tz });
};

// For multi-region systems, consider UTC-based generation
```

### Use Microseconds Judiciously

Enable microseconds only when needed:

```typescript
// Standard business documents (NO microseconds)
const invoiceGen = simpleID(1000, 4, false);

// High-frequency logging (YES microseconds)
const logGen = simpleID(0, 3, true);
```

### Plan for Growth

Design counter length with future growth in mind:

```typescript
// Current: 100 orders/day
// Growth: 1000 orders/day expected
// Use 5 digits for headroom
const orderGen = simpleID(0, 5);
```

## Comparison with Other Sequential Systems

| Feature               | SimpleID             | SequenceID | Database AUTO_INCREMENT | UUID v7      |
| --------------------- | -------------------- | ---------- | ----------------------- | ------------ |
| Human-readable date   | ✅                   | ✅         | ❌                      | ⚠️ (encoded) |
| Daily reset           | ✅                   | ❌         | ❌                      | ❌           |
| Sequential counter    | ✅                   | ✅         | ✅                      | ⚠️ (partial) |
| Sortable              | ✅                   | ✅         | ✅                      | ✅           |
| Distributed-safe      | ⚠️ (single instance) | ✅         | ❌                      | ✅           |
| Predictable length    | ✅                   | ✅         | ❌                      | ✅           |
| No database required  | ✅                   | ✅         | ❌                      | ✅           |
| Microsecond precision | ✅ (optional)        | ✅         | ❌                      | ✅           |

**When to use SimpleID:**

- ✅ Business documents requiring date-traceable references
- ✅ Single-server applications with daily reset needs
- ✅ Human-readable identifiers for customer-facing systems
- ✅ Daily sequences (invoices, orders, tickets)
- ✅ Systems where date visibility is important

**When to use alternatives:**

- ❌ Distributed systems requiring coordination → Use **SequenceID** or **ULID**
- ❌ Need globally unique without date component → Use **NanoID** or **UUID**
- ❌ MongoDB-specific requirements → Use **ObjectID**
- ❌ Continuous sequences across days → Use **SequenceID**

## Related Documentation

- [ID Package Overview](../README.md) - Main documentation and feature comparison
- [NanoID](ID-NanoID.md) - Compact, URL-safe unique identifiers
- [ObjectID](ID-ObjectID.md) - MongoDB-inspired identifiers
- [ULID](ID-ULID.md) - Universally unique lexicographically sortable IDs
- [SequenceID](ID-SequenceID.md) - Continuous sequential IDs with timestamps
- [Comparison Guide](ID-Comparison.md) - Detailed comparison of all ID types
- [Performance Benchmarks](ID-Performance.md) - Speed and efficiency metrics

---

[← Back to ID Documentation](../README.md)
