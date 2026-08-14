# CUID2

Cryptographically secure, collision-resistant identifier — configurable
length, lowercase-alphanumeric, **not** time-sortable by design.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## Table of Contents

- [Overview](#overview)
- [Format Structure](#format-structure)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Why CUID2 Is Not Time-Sortable](#why-cuid2-is-not-time-sortable)
- [Choosing a Length](#choosing-a-length)
- [See Also](#see-also)

## Overview

CUID2 is the cryptographically secure successor to [CUID](./ID-CUID.md).
Every character is drawn from `crypto.getRandomValues`, the format
deliberately omits a timestamp segment (so the minting time can't be
reconstructed), and the length is configurable to match your collision-
resistance budget.

- **Cryptographically secure**: full body sourced from `crypto.getRandomValues`.
- **No information leakage**: no embedded timestamp, counter, or
  machine fingerprint.
- **Configurable length**: 24..32 chars (default 24). Longer = lower
  collision probability.
- **URL- and shell-safe**: lowercase letters + digits only.

Pairs with `Guardian.string().cuid2({ length? })` from
`@tundralibs/guardian`, which validates the same
`[a-z][a-z0-9]{length-1}` format.

## Format Structure

```
k 3rj9xn8q1p7m2w5y6h4t8d9
│ └─────────────────────┘
│            23
│  letter + alphanumeric body  (default length = 24)
```

### Component Breakdown

| Component | Length       | Description                     |
| --------- | ------------ | ------------------------------- |
| Lead      | 1            | Random lowercase letter `[a-z]` |
| Body      | `length - 1` | Random base36 chars `[a-z0-9]`  |
| **Total** | **24..32**   | Full identifier                 |

### Character Set

CUID2 uses **lowercase base36**: `0-9` followed by `a-z`. The leading
character is restricted to letters (so the ID never looks like a number
to downstream parsers).

## API Reference

### cuid2()

Generate a CUID2 identifier.

```typescript ignore
function cuid2(length?: number): string;
```

#### Parameters

| Parameter | Type     | Default | Description                                   |
| --------- | -------- | ------- | --------------------------------------------- |
| `length`  | `number` | `24`    | Total length. Must be an integer in `24..32`. |

#### Returns

`string` — A `length`-character CUID2 (`[a-z][a-z0-9]{length-1}`).

#### Throws

`Error` — If `length` is not an integer in `24..32`.

#### Example

```typescript
import { cuid2 } from '@tundralibs/id';

const id = cuid2(); // 24 chars
const long = cuid2(32); // 32 chars
```

## Usage Examples

### Basic Usage

```typescript
import { cuid2 } from '@tundralibs/id';

const userId = cuid2(); // e.g. "k3rj9xn8q1p7m2w5y6h4t8d9"
const orderId = cuid2(28); // e.g. "k3rj9xn8q1p7m2w5y6h4t8d9a2b3"
```

### Sensitive Contexts (Public-Facing IDs)

CUID2 is appropriate when the ID is shown to users or attackers, because
it leaks no information:

```typescript
import { cuid2 } from '@tundralibs/id';

// Password reset tokens, email verification tokens, magic links —
// anything an attacker might try to enumerate or backdate.
const resetToken = cuid2(32);
const verificationCode = cuid2(28);
```

### Validation Pairing

```typescript
import { cuid2 } from '@tundralibs/id';
import { Guardian } from '@tundralibs/guardian';

const Cuid2Guard = Guardian.string().cuid2({ length: 24 });

const id = cuid2();
const ok = Cuid2Guard.parse(id);
```

## Why CUID2 Is Not Time-Sortable

CUID v1 (and ULID) encode the minting timestamp into the ID's high-order
characters, giving free sortability — but at the cost of leaking when
the ID was created. For database primary keys that never leave the
server, this is usually a non-issue. For tokens, public URLs, or
anything an attacker can see, the timestamp leak can:

- Reveal user signup patterns / activity windows.
- Make brute-force enumeration cheaper (attacker can narrow the search
  to recent IDs).
- Correlate seemingly-independent events that happened at the same time.

CUID2 trades sortability for privacy. If you need sortability AND a
privacy-preserving format, you can pair `cuid2()` with a separate
sortable column (e.g. `createdAt`).

## Choosing a Length

Collision probability scales with the size of the random body. The
defaults are chosen to make collisions vanishingly unlikely even at
billions of generations.

| Length | Random bits (approx) | Collision after N IDs (50% probability) |
| ------ | -------------------- | --------------------------------------- |
| 24     | ~119 bits            | ~10¹⁸ — fine for almost any application |
| 28     | ~140 bits            | ~10²¹                                   |
| 32     | ~160 bits            | ~10²⁴ — overkill for nearly anything    |

When in doubt: **use the default (24)**.

## See Also

- [Main ID Documentation](../README.md) — Overview of all ID generators
- [CUID v1](./ID-CUID.md) — Process-sortable predecessor
- [ULID](./ID-ULID.md) — Distributed-safe sortable identifiers
- [Comparison Guide](./ID-Comparison.md) — Choosing the right ID type
- [Original CUID2 Spec](https://github.com/paralleldrive/cuid2) — Reference implementation

---

[← Back to ID Documentation](../README.md)
