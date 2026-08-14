# NanoID

A tiny, secure, URL-safe unique string ID generator for modern JavaScript runtimes.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Size: 130 bytes](https://img.shields.io/badge/size-130%20bytes-blue)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [API Reference](#api-reference)
  - [nanoID()](#nanoid)
  - [Character Sets](#character-sets)
- [Usage Examples](#usage-examples)
  - [Basic Usage](#basic-usage)
  - [Custom Length](#custom-length)
  - [Custom Character Sets](#custom-character-sets)
  - [Session Tokens](#session-tokens)
  - [API Keys](#api-keys)
  - [File Names](#file-names)
- [Use Cases](#use-cases)
- [Security Considerations](#security-considerations)
- [Best Practices](#best-practices)
- [Performance](#performance)
- [Migration Guide](#migration-guide)
  - [From UUID](#from-uuid)
  - [From MongoDB ObjectID](#from-mongodb-objectid)
  - [From Node.js nanoid](#from-nodejs-nanoid)
- [Related Documentation](#related-documentation)

## Overview

NanoID is a compact, URL-safe unique ID generator that produces collision-resistant identifiers using cryptographically strong random generation. It's perfect for public-facing IDs, API keys, session tokens, and any scenario where you need short, readable identifiers.

Based on the popular [Node.js nanoid project](https://github.com/ai/nanoid), this implementation is optimized for Deno, Bun, and Node.js, providing excellent performance with zero dependencies.

**Why NanoID?**

- **Compact**: 21 characters vs UUID's 36 characters
- **URL-safe**: No encoding needed for web use
- **Readable**: Uses a larger alphabet than UUID (a-z, 0-9, _, -)
- **Customizable**: Adjust length and character set for your needs
- **Secure**: Uses Web Crypto API for cryptographic randomness
- **Fast**: Optimized for high-throughput generation

## Features

| Feature                  | Support | Description                                    |
| ------------------------ | ------- | ---------------------------------------------- |
| Cryptographically Secure | ✅      | Uses Web Crypto API for strong randomness      |
| URL-Safe                 | ✅      | Default alphabet is URL-safe without encoding  |
| Customizable Length      | ✅      | Any length from 1 to unlimited characters      |
| Custom Alphabets         | ✅      | Use any character set for specialized needs    |
| Zero Dependencies        | ✅      | Self-contained with no external dependencies   |
| Collision Resistant      | ✅      | < 1% collision rate even with 10,000 samples   |
| High Performance         | ✅      | Optimized generation with efficient algorithms |
| Runtime Agnostic         | ✅      | Works on Deno, Bun, and Node.js                |

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
import { nanoID } from 'jsr:@tundralibs/id';
```

## API Reference

### nanoID()

Generates a cryptographically secure unique identifier.

```typescript ignore
function nanoID(size?: number, base?: string): string;
```

**Parameters:**

- `size` - _Optional_. Length of the generated ID (default: `21`)
  - Must be a positive integer (NaN, fractional, or Infinite values throw
    `InvalidOptionError`)
  - Recommended: 21 for high uniqueness
  - Minimum: 6 for reasonable collision resistance
  - No upper limit, but consider performance

- `base` - _Optional_. Character set to use for ID generation (default: `WEB_SAFE`)
  - Must not be empty
  - Can be any string of characters
  - Longer alphabets provide better uniqueness per character
  - See [Character Sets](#character-sets) for predefined options

**Returns:** `string` - A unique identifier of the specified length

**Throws:**

- `InvalidOptionError` - If `size` is less than 1 or not an integer (NaN, a
  fractional value, or Infinity). A NaN or fractional size is **not** silently
  coerced (which would yield an empty or wrong-length ID).
- `InvalidOptionError` - If `base` string is empty or undefined

**Collision Resistance:**

With default settings (21 characters, 38-character alphabet):

- **1 billion IDs**: ~3 × 10⁻¹⁴% collision probability
- **1 trillion IDs**: ~3 × 10⁻⁸% collision probability

### Character Sets

NanoID provides predefined character sets for common use cases:

#### `WEB_SAFE`

**Characters:** `a-z`, `0-9`, `_`, `-` (38 characters)

**Use for:** URLs, API endpoints, public IDs

```typescript
import { nanoID, WEB_SAFE } from '@tundralibs/id';

const id = nanoID(21, WEB_SAFE); // Default
// => "g0b30yv24uuo0grjvi6su"
```

#### `ALPHA_NUMERIC`

**Characters:** `a-z`, `A-Z`, `0-9` (62 characters)

**Use for:** Database keys, general-purpose IDs

```typescript
import { ALPHA_NUMERIC, nanoID } from '@tundralibs/id';

const id = nanoID(16, ALPHA_NUMERIC);
// => "4f90d13a42e6B9cK"
```

#### `ALPHA_NUMERIC_CASE`

**Characters:** `a-z`, `0-9` (36 characters, lowercase only)

**Use for:** Case-insensitive systems, filenames

```typescript
import { ALPHA_NUMERIC_CASE, nanoID } from '@tundralibs/id';

const id = nanoID(12, ALPHA_NUMERIC_CASE);
// => "4f90d13a42e6"
```

#### `NUMBERS`

**Characters:** `0-9` (10 characters)

**Use for:** Numeric codes, PINs, verification codes

```typescript
import { nanoID, NUMBERS } from '@tundralibs/id';

const code = nanoID(6, NUMBERS);
// => "834291"
```

#### `ALPHABETS`

**Characters:** `a-z` (26 characters, lowercase only)

**Use for:** Readable codes, voucher codes

```typescript
import { ALPHABETS, nanoID } from '@tundralibs/id';

const voucher = nanoID(8, ALPHABETS);
// => "xmckdspo"
```

#### `PASSWORD`

**Characters:** `a-z`, `0-9`, `_`, `-`, `!`, `@`, `$`, `%`, `^`, `&`, `*` (45 characters)

**Use for:** Temporary passwords, secure tokens

```typescript
import { nanoID, PASSWORD } from '@tundralibs/id';

const password = nanoID(16, PASSWORD);
// => "k9!m@2x$p4^w7&a-"
```

## Usage Examples

### Basic Usage

Generate a default 21-character URL-safe ID:

```typescript
import { nanoID } from '@tundralibs/id';

const id = nanoID();
console.log(id); // "g0b30yv24uuo0grjvi6su"

// Use in URLs
const url = `https://example.com/item/${id}`;
```

### Custom Length

Adjust the ID length based on your requirements:

```typescript
import { nanoID } from '@tundralibs/id';

// Short ID for internal use (higher collision risk)
const shortId = nanoID(8);
// => "ridvgi_4"

// Long ID for maximum uniqueness
const longId = nanoID(32);
// => "s6iwx90r18q0ibtxe0ltkc6ni2dmyxf4"
```

**Length Recommendations:**

- **6-8 chars**: Internal IDs, low-volume applications
- **10-12 chars**: Short links, moderate uniqueness needs
- **21 chars** (default): High uniqueness, recommended for most cases
- **32+ chars**: Maximum security, distributed systems

### Custom Character Sets

Create IDs with specialized character sets:

```typescript
import { nanoID } from '@tundralibs/id';

// Hexadecimal IDs
const hexId = nanoID(16, '0123456789ABCDEF');
// => "2A94B63F8E1C0D5A"

// Emoji IDs (for fun!)
const emojiId = nanoID(10, '😀😃😄😁😆😅🤣😂🙂🙃');
// => "😀😃🙂😅😁🤣😂😄🙃😆"

// Binary IDs
const binaryId = nanoID(32, '01');
// => "10110010110101001011010010110101"

// Custom alphabet for specific needs
const customId = nanoID(12, 'ACGT'); // DNA sequences
// => "ACGTACGTACGT"
```

### Session Tokens

Generate secure session identifiers:

```typescript
import { nanoID } from '@tundralibs/id';

class SessionManager {
  createSession(userId: string) {
    const sessionId = nanoID(32); // Extra length for security

    return {
      sessionId,
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
    };
  }
}

const manager = new SessionManager();
const session = manager.createSession('user123');
// {
//   sessionId: "s6iwx90r18q0ibtxe0ltkc6ni2dmyxf4",
//   userId: "user123",
//   createdAt: 1640000000000,
//   expiresAt: 1640086400000
// }
```

### API Keys

Generate API keys with prefixes for identification:

```typescript
import { nanoID } from '@tundralibs/id';

function generateApiKey(type: 'public' | 'secret'): string {
  const prefix = type === 'public' ? 'pk_' : 'sk_';
  const length = type === 'public' ? 24 : 32;
  const key = nanoID(length);

  return `${prefix}${key}`;
}

const publicKey = generateApiKey('public');
// => "pk_99nxdss1f5r9neh0gtczz-d_"

const secretKey = generateApiKey('secret');
// => "sk_s6iwx90r18q0ibtxe0ltkc6ni2dmyxf4"
```

### File Names

Generate unique filenames:

```typescript
import { ALPHA_NUMERIC_CASE, nanoID } from '@tundralibs/id';

function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop();
  const id = nanoID(12, ALPHA_NUMERIC_CASE);
  return `${id}.${ext}`;
}

const uniqueFileName = generateFileName('document.pdf');
// => "4f90d13a42e6.pdf"
```

### Short URLs

Create short URL identifiers:

```typescript
import { ALPHA_NUMERIC, nanoID } from '@tundralibs/id';

class UrlShortener {
  private urls = new Map<string, string>();

  shorten(longUrl: string): string {
    const shortCode = nanoID(8, ALPHA_NUMERIC);
    this.urls.set(shortCode, longUrl);
    return `https://short.url/${shortCode}`;
  }

  expand(shortCode: string): string | undefined {
    return this.urls.get(shortCode);
  }
}

const shortener = new UrlShortener();
const shortUrl = shortener.shorten('https://example.com/very/long/url/path');
// => "https://short.url/4f90d13a"
```

## Use Cases

| Use Case                  | Recommended Length | Character Set        | Example                               |
| ------------------------- | ------------------ | -------------------- | ------------------------------------- |
| **Public URLs**           | 10-12              | `WEB_SAFE`           | `short.url/ridvgi_4p7`                |
| **Database Primary Keys** | 21                 | `ALPHA_NUMERIC`      | `4f90d13a42e6B9cK1mN2p`               |
| **Session IDs**           | 32                 | `WEB_SAFE`           | `s6iwx90r18q0ibtxe0ltkc6ni2dmyxf4`    |
| **API Keys**              | 32                 | `WEB_SAFE`           | `sk_s6iwx90r18q0ibtxe0ltkc6ni2dmyxf4` |
| **File Names**            | 12-16              | `ALPHA_NUMERIC_CASE` | `4f90d13a42e6.jpg`                    |
| **Verification Codes**    | 6                  | `NUMBERS`            | `834291`                              |
| **Voucher Codes**         | 8-10               | `ALPHABETS`          | `xmckdspo`                            |
| **Temporary Passwords**   | 16                 | `PASSWORD`           | `k9!m@2x$p4^w7&a-`                    |

## Security Considerations

### Cryptographic Strength

NanoID uses the Web Crypto API (`crypto.getRandomValues()`) to generate cryptographically secure random values. This ensures:

- **Unpredictability**: IDs cannot be guessed or predicted
- **Uniform Distribution**: All characters have equal probability
- **No Sequential Patterns**: IDs are not incrementally related

### Collision Probability

The collision probability depends on:

1. **ID length**: Longer IDs = lower collision probability
2. **Alphabet size**: More characters = more possible combinations
3. **Number of IDs generated**: More IDs = higher collision probability

**Formula:** `P(collision) ≈ (n² / 2) / (alphabetSize ^ idLength)`

**Examples (21 characters, 38-character alphabet):**

| IDs Generated     | Collision Probability |
| ----------------- | --------------------- |
| 1,000             | ~3 × 10⁻²⁶%           |
| 1,000,000         | ~3 × 10⁻²⁰%           |
| 1,000,000,000     | ~3 × 10⁻¹⁴%           |
| 1,000,000,000,000 | ~3 × 10⁻⁸%            |

### Security Recommendations

1. **Use appropriate length**: Default 21 characters provides excellent uniqueness
2. **Never use for cryptographic keys**: Use dedicated key generation functions
3. **Don't expose generation logic**: Keep server-side when possible
4. **Validate before use**: Check format and length before trusting user input
5. **Use HTTPS**: Always transmit IDs over secure connections
6. **Implement rate limiting**: Prevent abuse of ID generation endpoints

## Best Practices

### Choosing ID Length

```typescript
import { nanoID } from '@tundralibs/id';

// ❌ BAD: Too short for unique IDs
const badId = nanoID(4); // High collision risk

// ✅ GOOD: Appropriate lengths for different use cases
const shortUrl = nanoID(10); // Short URLs (moderate uniqueness)
const standardId = nanoID(); // Default (high uniqueness)
const sessionId = nanoID(32); // Security-critical (maximum uniqueness)
```

### Choosing Character Sets

```typescript
import { ALPHA_NUMERIC_CASE, nanoID, PASSWORD, WEB_SAFE } from '@tundralibs/id';

// ❌ BAD: Using complex characters where not needed
const badFilename = nanoID(12, PASSWORD); // Special chars problematic in filenames

// ✅ GOOD: Appropriate character sets
const filename = nanoID(12, ALPHA_NUMERIC_CASE); // Safe for all systems
const publicId = nanoID(21, WEB_SAFE); // URL-safe
const token = nanoID(32, PASSWORD); // Security tokens
```

### Performance Optimization

```typescript
import { nanoID } from '@tundralibs/id';

// ❌ BAD: Generating IDs repeatedly in tight loops
const ids: string[] = [];
for (let i = 0; i < 10000; i++) {
  ids.push(nanoID());
}

// ✅ GOOD: Batch generation when possible
function generateBatch(count: number, length = 21): string[] {
  const ids: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = nanoID(length);
  }
  return ids;
}

const batchIds = generateBatch(10000);
```

### Error Handling

```typescript
import { nanoID } from '@tundralibs/id';

// ❌ BAD: No error handling
function createUserUnchecked(name: string) {
  const id = nanoID(0); // Will throw error
  return { id, name };
}

// ✅ GOOD: Proper error handling
function createUser(name: string, idLength = 21) {
  try {
    if (idLength < 6) {
      throw new Error('ID length must be at least 6 for security');
    }
    const id = nanoID(idLength);
    return { id, name };
  } catch (error) {
    console.error('Failed to create user:', error);
    throw new Error('User creation failed');
  }
}
```

### Storage Considerations

```typescript
import { nanoID } from '@tundralibs/id';

// Consider database storage efficiency
interface User {
  id: string; // nanoID(21) = 21 bytes
  email: string;
  name: string;
}

// For large datasets, balance ID length with storage
const compactId = nanoID(16); // 16 bytes, still high uniqueness
const standardId = nanoID(21); // 21 bytes, maximum uniqueness
```

## Performance

NanoID is optimized for high-performance ID generation:

**Benchmarks (M1 Mac, Deno 1.40):**

| Operation          | Ops/sec | Time/op |
| ------------------ | ------- | ------- |
| nanoID() default   | ~2.5M   | ~400ns  |
| nanoID(10)         | ~5.2M   | ~190ns  |
| nanoID(32)         | ~1.8M   | ~550ns  |
| nanoID(8, NUMBERS) | ~6.1M   | ~163ns  |

**Comparison with other ID generators:**

| Generator | Ops/sec | Size (bytes) | Sortable |
| --------- | ------- | ------------ | -------- |
| NanoID    | 2.5M    | 21           | ❌       |
| UUID v4   | 1.8M    | 36           | ❌       |
| ObjectID  | 1.2M    | 24           | ✅       |
| ULID      | 1.0M    | 26           | ✅       |

**Optimization tips:**

1. **Choose appropriate length**: Shorter IDs generate faster
2. **Use smaller alphabets**: Fewer characters = faster generation
3. **Avoid tight loops**: Batch generation when possible
4. **Cache generated IDs**: Pre-generate for known use cases

## Migration Guide

### From UUID

UUIDs are 36 characters long with hyphens. NanoID provides similar uniqueness with shorter length:

```typescript
import { nanoID } from '@tundralibs/id';

// Before (UUID v4)
// const id = "123e4567-e89b-12d3-a456-426614174000"; // 36 chars

// After (NanoID)
const id = nanoID(); // 21 chars
// => "g0b30yv24uuo0grjvi6su"

// Migration strategy
function migrateFromUuid(uuidId: string): string {
  // Option 1: Generate new NanoID
  return nanoID();

  // Option 2: Keep UUID format for backward compatibility
  // and use NanoID for new records only
}
```

**Database migration:**

```sql
-- Add new column for NanoID
ALTER TABLE users ADD COLUMN nano_id VARCHAR(21);

-- Generate NanoIDs for existing records (application-side)
UPDATE users SET nano_id = ? WHERE id = ?;

-- Eventually transition to using nano_id as primary key
```

### From MongoDB ObjectID

ObjectIDs are 26-character mixed-radix strings (not the canonical 24-char hex) with embedded timestamps. NanoID doesn't include timestamps but provides similar uniqueness:

```typescript
import { nanoID } from '@tundralibs/id';
import { ObjectID } from '@tundralibs/id';

// Before (ObjectID)
// const id = "65a1b2c3019aB30c1f4q000001"; // 26 chars, sortable

// After (NanoID)
const id = nanoID(21); // 21 chars, not sortable
// => "g0b30yv24uuo0grjvi6su"

// If you need sortability, use ULID instead
import { ulid } from '@tundralibs/id';
const sortableId = ulid();
// => "01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

### From Node.js nanoid

If you're migrating from the Node.js nanoid package, the API is nearly identical:

```typescript
// Before (Node.js nanoid)
// import { nanoid } from 'nanoid';
// const id = nanoid();

// After (@tundralibs/id)
import { nanoID } from '@tundralibs/id';
const id = nanoID();

// Function name is different (nanoID vs nanoid) but usage is the same
```

**API differences:**

| Node.js nanoid     | @tundralibs/id       | Notes                 |
| ------------------ | -------------------- | --------------------- |
| `nanoid()`         | `nanoID()`           | Function name differs |
| `nanoid(size)`     | `nanoID(size)`       | Same                  |
| `customAlphabet()` | `nanoID(size, base)` | Direct parameter      |
| `urlAlphabet`      | `WEB_SAFE`           | Constant name differs |

## Related Documentation

- [ObjectID](ID-ObjectID.md) - MongoDB-compatible 12-byte identifiers
- [ULID](ID-ULID.md) - Sortable, timestamp-based IDs
- [SequenceID](ID-SequenceID.md) - Sequential IDs with timestamp and counter
- [SimpleID](ID-SimpleID.md) - Lightweight random string generator
- [Comparison Guide](ID-Comparison.md) - Compare all ID generators
- [Performance](ID-Performance.md) - Benchmarks and optimization

---

[← Back to ID](../README.md)
