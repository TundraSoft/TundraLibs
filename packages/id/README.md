# ID

Cross-runtime ID generators for Deno, Bun, and Node.js — NanoID, CUID, CUID2, ULID, MongoDB ObjectID, and sequential/simple IDs.

[![JSR](https://jsr.io/badges/@tundralibs/id)](https://jsr.io/@tundralibs/id)
[![JSR Score](https://jsr.io/badges/@tundralibs/id/score)](https://jsr.io/@tundralibs/id)
![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Overview

The ID package provides high-performance ID generators optimized for different scenarios: compact URLs (NanoID), distributed systems (ObjectID, ULID), sequential ordering (SequenceID), date-sequential IDs (SimpleID), and collision-resistant IDs with privacy-preserving format (CUID, CUID2). All generators are collision-resistant, cryptographically secure where appropriate, and work seamlessly across Deno, Bun, Node.js, Cloudflare Workers, and browsers — the process-identifier component that ObjectID/SequenceID mix in for cross-process uniqueness degrades to `0` where no process ID is exposed (Workers, browsers), which is documented, not a functional break.

## Key Features

- ✅ **Multiple ID formats** - Choose the right ID type for your use case
- ✅ **High performance** - Optimized generators with minimal overhead
- ✅ **Collision resistant** - Cryptographically secure random generation
- ✅ **URL-safe** - All IDs work in URLs without encoding
- ✅ **Sortable options** - Timestamp-based ordering with ULID and SequenceID
- ✅ **MongoDB-inspired** - ObjectID uses a MongoDB-style layout (not the canonical 24-char hex — see [ObjectID docs](https://github.com/TundraSoft/TundraLibs/wiki/ID-ObjectID))
- ✅ **Dependency-light** - only the `@tundralibs/compat` and `@tundralibs/utils` workspace siblings, no third-party runtime deps
- ✅ **Runtime agnostic** - Works on Deno, Bun, Node.js, Cloudflare Workers, and browsers

## Documentation

| Topic                                                                           | Description                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------- |
| [NanoID](https://github.com/TundraSoft/TundraLibs/wiki/ID-NanoID)               | Compact, URL-safe IDs with custom alphabets     |
| [ObjectID](https://github.com/TundraSoft/TundraLibs/wiki/ID-ObjectID)           | MongoDB-inspired mixed-radix identifiers        |
| [ULID](https://github.com/TundraSoft/TundraLibs/wiki/ID-ULID)                   | Sortable, timestamp-based universally unique    |
| [CUID](https://github.com/TundraSoft/TundraLibs/wiki/ID-CUID)                   | Process-sortable 25-char `c`-prefixed IDs       |
| [CUID2](https://github.com/TundraSoft/TundraLibs/wiki/ID-CUID2)                 | Cryptographically secure, privacy-preserving    |
| [SequenceID](https://github.com/TundraSoft/TundraLibs/wiki/ID-SequenceID)       | Sequential IDs with timestamp and counter       |
| [SimpleID](https://github.com/TundraSoft/TundraLibs/wiki/ID-SimpleID)           | Date-sequential, human-readable IDs             |
| [Comparison Guide](https://github.com/TundraSoft/TundraLibs/wiki/ID-Comparison) | Feature comparison and use case recommendations |
| [Performance](https://github.com/TundraSoft/TundraLibs/wiki/ID-Performance)     | Benchmarks and optimization tips                |

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
import { cuid, cuid2, nanoID, ObjectID, ulid } from 'jsr:@tundralibs/id';
```

## Quick Start

### NanoID - Compact & URL-Safe

```typescript
import { nanoID } from '@tundralibs/id';

// Default 21-character ID
const id = nanoID();
// => 'g0b30yv24uuo0grjvi6su'

// Custom length
const shortId = nanoID(10);
// => 'ridvgi_4p7'

// Custom alphabet
import { NUMBERS } from '@tundralibs/id';
const numericId = nanoID(8, NUMBERS);
// => '12345678'
```

### ObjectID - MongoDB-inspired

```typescript
import { ObjectID } from '@tundralibs/id';

// Create new ObjectID — 26-char mixed-radix string, NOT canonical 24-char hex
const genId = ObjectID();
const id = genId();
// => '65a1b2c3019aB30c1f4q000001'

// Custom starting counter + explicit machine ID (its length widens the ID)
const existing = ObjectID(1000, 'server01');
const serverId = existing();
// => e.g. '65a1b2c3019server010c1f4q001001' (31 chars: the 8-char machine ID)
```

### ULID - Sortable & Unique

```typescript
import { monotonicUlid, ulid } from '@tundralibs/id';

// Standard ULID
const id = ulid();
// => '01ARZ3NDEKTSV4RRFFQ69G5FAV'

// Monotonic ULID (guaranteed sort order)
const id1 = monotonicUlid();
const id2 = monotonicUlid();
// id2 > id1 even if generated in same millisecond
```

### CUID - Process-Sortable, `c`-Prefixed

```typescript
import { cuid } from '@tundralibs/id';

const id = cuid();
// => 'clrwk6yt40001qz2ek6f7r2t1'
// Format: c + 8-char timestamp + 4-char counter + 4-char fingerprint + 8 random chars
// IDs minted in the same process sort lexicographically by creation order.
```

### CUID2 - Cryptographically Secure, Privacy-Preserving

```typescript
import { cuid2 } from '@tundralibs/id';

const id = cuid2(); // 24-char default
// => 'k3rj9xn8q1p7m2w5y6h4t8d9'

const longerId = cuid2(32); // 24..32 supported
```

Unlike CUID and ULID, CUID2 has **no embedded timestamp** — minting time
can't be reconstructed from the ID. Use for public-facing tokens
(magic links, password reset, verification codes).

### SequenceID - Sequential with Timestamp

```typescript
import { sequenceID } from '@tundralibs/id';

// Create sequential IDs
const seq = sequenceID();
const id1 = seq();
// => 72623859790382856n

const id2 = seq();
// => 72623859790382857n
```

### SimpleID - Date-Sequential

```typescript
import { simpleID } from '@tundralibs/id';

// Default date-based ID with counter
const gen = simpleID();
const id = gen();
// => 202412260001n (YYYYMMDDNNNN)

// Custom counter length
const orderGen = simpleID(0, 6);
const orderId = orderGen();
// => 20241226000001n
```

## Which ID Should I Use?

- **URLs and public IDs**: NanoID (compact, customizable)
- **Traceable distributed IDs**: ObjectID (embedded timestamp + machine + counter)
- **Distributed systems**: ULID (sortable, timestamp-based)
- **Process-sortable, `c`-prefixed**: CUID (25-char, ParallelDrive convention)
- **Tokens / public IDs where minting time must stay private**: CUID2
- **Sequential ordering**: SequenceID (ordered with counter)
- **Date-sequential counters**: SimpleID (predictable, human-readable)

See the [Comparison Guide](https://github.com/TundraSoft/TundraLibs/wiki/ID-Comparison) for detailed recommendations.

## License

MIT

---

[← Back to TundraLibs](https://github.com/TundraSoft/TundraLibs/wiki/Home)
