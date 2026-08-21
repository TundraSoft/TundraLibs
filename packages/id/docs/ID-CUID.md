# CUID

Collision-resistant identifiers — 25 characters, `c`-prefixed, sortable
within a single process.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## Table of Contents

- [Overview](#overview)
- [Format Structure](#format-structure)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [When to Use CUID](#when-to-use-cuid)
- [CUID vs CUID2](#cuid-vs-cuid2)
- [See Also](#see-also)

## Overview

CUID (v1) is a 25-character collision-resistant identifier originally
proposed by ParallelDrive. The format combines a timestamp, a per-process
rolling counter, a per-process fingerprint, and a random tail — giving you:

- **Sortable creation order** within a single process (timestamp is the
  highest-order segment).
- **Cross-process disambiguation** via the fingerprint segment.
- **URL- and shell-safe**: letters + digits only, no special characters.
- **Self-identifying**: the leading `c` distinguishes CUIDs from raw
  base36 / base62 / hex strings at a glance.

Pairs with `Guardian.string().cuid()` from `@tundralibs/guardian`, which
validates the same 25-char `c[a-z0-9]{24}` format.

> **Looking for CUID2?** Use [cuid2](./ID-CUID2.md) instead — it's
> cryptographically secure, deliberately not time-sortable (so the
> minting time can't be reconstructed from the ID), and configurable
> length. CUID v1 is kept for compatibility and process-local
> sortability.

## Format Structure

```
c lrwk6yt4 0001 qz2e k6f7r2t1
│ └──────┘ └──┘ └──┘ └──────┘
│     8     4    4      8
│  timestamp  ctr  fp   random   = 24 + leading 'c' = 25
```

### Component Breakdown

| Component   | Length | Description                                               |
| ----------- | ------ | --------------------------------------------------------- |
| Prefix      | 1      | Literal `c` — canonical CUID marker                       |
| Timestamp   | 8      | `Date.now()` in base36                                    |
| Counter     | 4      | Per-process rolling counter (base36, mod 36⁴)             |
| Fingerprint | 4      | Per-process random base36 string (computed on first call) |
| Random      | 8      | Random base36 chars drawn from `crypto.getRandomValues`   |
| **Total**   | **25** |                                                           |

### Character Set

CUIDs use **lowercase base36**: `0-9` followed by `a-z`. No uppercase, no
special characters — safe for URLs, shell arguments, filenames, and
case-insensitive databases.

## API Reference

### cuid()

Generate a 25-character CUID.

```typescript ignore
function cuid(): string;
```

#### Returns

`string` — A 25-character CUID (`c` + 24 base36 chars).

#### Example

```typescript
import { cuid } from '@tundralibs/id';

const id = cuid();
// => "clrwk6yt40001qz2ek6f7r2t1"
```

The function takes no arguments — timestamp, counter, fingerprint, and
randomness are all sourced internally.

## Usage Examples

### Basic Usage

```typescript
import { cuid } from '@tundralibs/id';

const userId = cuid();
const orderId = cuid();
const sessionId = cuid();
```

### Bulk Generation (Sortable Within a Process)

```typescript
import { cuid } from '@tundralibs/id';

const ids = Array.from({ length: 1000 }, () => cuid());

// Same-process CUIDs sort lexicographically by creation order.
const sorted = [...ids].sort();
console.log(ids.every((id, i) => id === sorted[i])); // true
```

The timestamp segment dominates the sort; the counter breaks ties within
the same millisecond.

### Validation Pairing

```typescript
import { cuid } from '@tundralibs/id';
// Needs a separate install: deno add @tundralibs/guardian
import { Guardian } from '@tundralibs/guardian';

const CuidGuard = Guardian.string().cuid();

const id = cuid();
const ok = CuidGuard.parse(id); // round-trips cleanly
```

## When to Use CUID

**Use CUID when:**

- You need process-local sortability.
- You want short (25-char) IDs that are URL- and shell-safe.
- You're following an existing CUID convention or migrating from
  ParallelDrive's reference implementation.

**Prefer something else when:**

- You need cryptographic collision resistance → use
  [cuid2](./ID-CUID2.md).
- You need distributed sortability across machines without coordination
  → use [ulid](./ID-ULID.md).
- You need MongoDB-native IDs → use [ObjectID](./ID-ObjectID.md).

## CUID vs CUID2

| Aspect                   | CUID                                          | CUID2                             |
| ------------------------ | --------------------------------------------- | --------------------------------- |
| **Length**               | 25 chars (fixed)                              | 24..32 chars (default 24)         |
| **Prefix**               | Always `c`                                    | Any letter `a..z`                 |
| **Time-sortable**        | ✅ Within a process                           | ❌ Deliberately not               |
| **Randomness source**    | `crypto.getRandomValues`                      | `crypto.getRandomValues`          |
| **Reveals minting time** | ✅ Yes (timestamp in prefix)                  | ❌ No (privacy by design)         |
| **Collision resistance** | High (counter + fingerprint + 8 random chars) | Very high (entire body is random) |

The two formats coexist on purpose — pick CUID when sortability matters,
CUID2 when it doesn't.

## See Also

- [Main ID Documentation](../README.md) — Overview of all ID generators
- [CUID2](./ID-CUID2.md) — Cryptographically secure successor
- [ULID](./ID-ULID.md) — Distributed-safe sortable identifiers
- [Comparison Guide](./ID-Comparison.md) — Choosing the right ID type
- [Original CUID Spec](https://github.com/paralleldrive/cuid) — Reference implementation

---

[← Back to ID Documentation](../README.md)
