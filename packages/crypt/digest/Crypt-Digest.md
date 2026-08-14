# Crypt-Digest

Cryptographic hashing functions using the Web Crypto API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
  - [digest()](#digest)
  - [sha256()](#sha256)
  - [sha512()](#sha512)
  - [sha384()](#sha384)
  - [sha1()](#sha1)
- [Examples](#examples)
- [Security Notes](#security-notes)

## Overview

The Digest module provides cryptographic hash functions for creating fixed-size digests from arbitrary data. All functions use the native Web Crypto API for secure, standards-compliant hashing.

### Features

| Feature         | Bun | Deno | Node.js |
| --------------- | --- | ---- | ------- |
| SHA-1           | ✅  | ✅   | ✅      |
| SHA-256         | ✅  | ✅   | ✅      |
| SHA-384         | ✅  | ✅   | ✅      |
| SHA-512         | ✅  | ✅   | ✅      |
| Hex encoding    | ✅  | ✅   | ✅      |
| Base64 encoding | ✅  | ✅   | ✅      |
| Binary input    | ✅  | ✅   | ✅      |

## Installation

**Deno:**

```bash
deno add @tundralibs/crypt
```

**Bun:**

```bash
bunx jsr add @tundralibs/crypt
```

**Node.js:**

```bash
npx jsr add @tundralibs/crypt
```

## API Reference

### `digest()`

Generates a cryptographic hash using the specified algorithm.

**Signature:**

```typescript ignore
async function digest(
  data: string | Uint8Array,
  options?: DigestOptions,
): Promise<string>;
```

**Parameters:**

- `data` - The data to hash (string or Uint8Array)
- `options` - Optional configuration:
  - `algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'` - Hash algorithm (default: `'SHA-256'`)
  - `encoding?: 'hex' | 'base64'` - Output encoding (default: `'hex'`)

**Returns:** Promise resolving to the encoded hash string

**Throws:** Error when algorithm is not supported

**Example:**

```typescript
import { digest } from '@tundralibs/crypt/digest';

// Default SHA-256 with hex encoding
const hash = await digest('my data');
console.log(hash); // "b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de"

// SHA-512 with base64 encoding
const hash512 = await digest('my data', {
  algorithm: 'SHA-512',
  encoding: 'base64',
});

// Hash binary data
const binaryData = new Uint8Array([1, 2, 3, 4]);
const binaryHash = await digest(binaryData, { algorithm: 'SHA-384' });
```

### `sha256()`

Convenience function for SHA-256 hashing (most commonly used).

**Signature:**

```typescript ignore
async function sha256(
  data: string | Uint8Array,
  encoding?: 'hex' | 'base64',
): Promise<string>;
```

**Parameters:**

- `data` - The data to hash
- `encoding` - Output encoding (default: `'hex'`)

**Returns:** Promise resolving to the SHA-256 hash

**Example:**

```typescript
import { sha256 } from '@tundralibs/crypt/digest';

const hash = await sha256('my data');
console.log(hash); // SHA-256 hash in hex

const base64Hash = await sha256('my data', 'base64');
console.log(base64Hash); // SHA-256 hash in base64
```

### `sha512()`

Convenience function for SHA-512 hashing.

**Signature:**

```typescript ignore
async function sha512(
  data: string | Uint8Array,
  encoding?: 'hex' | 'base64',
): Promise<string>;
```

**Parameters:**

- `data` - The data to hash
- `encoding` - Output encoding (default: `'hex'`)

**Returns:** Promise resolving to the SHA-512 hash

**Example:**

```typescript
import { sha512 } from '@tundralibs/crypt/digest';

const hash = await sha512('my data');
// Returns 128 hex characters (512 bits)
```

### `sha384()`

Convenience function for SHA-384 hashing.

**Signature:**

```typescript ignore
async function sha384(
  data: string | Uint8Array,
  encoding?: 'hex' | 'base64',
): Promise<string>;
```

**Parameters:**

- `data` - The data to hash
- `encoding` - Output encoding (default: `'hex'`)

**Returns:** Promise resolving to the SHA-384 hash

**Example:**

```typescript
import { sha384 } from '@tundralibs/crypt/digest';

const hash = await sha384('my data');
// Returns 96 hex characters (384 bits)
```

### `sha1()`

Convenience function for SHA-1 hashing.

**Signature:**

```typescript ignore
async function sha1(
  data: string | Uint8Array,
  encoding?: 'hex' | 'base64',
): Promise<string>;
```

**Parameters:**

- `data` - The data to hash
- `encoding` - Output encoding (default: `'hex'`)

**Returns:** Promise resolving to the SHA-1 hash

**Example:**

```typescript
import { sha1 } from '@tundralibs/crypt/digest';

const hash = await sha1('my data');
// Returns 40 hex characters (160 bits)
```

## Examples

### File Integrity Check

```typescript
import { sha256 } from '@tundralibs/crypt/digest';

async function verifyFileIntegrity(
  fileContent: string,
  expectedHash: string,
): Promise<boolean> {
  const actualHash = await sha256(fileContent);
  return actualHash === expectedHash;
}

const isValid = await verifyFileIntegrity(
  'file content',
  'b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de',
);
```

### Password Hashing (Not Recommended)

```typescript
import { sha256 } from '@tundralibs/crypt/digest';

// ⚠️ For demonstration only - use dedicated password hashing
// algorithms like Argon2, bcrypt, or scrypt in production
async function hashPassword(password: string, salt: string): Promise<string> {
  return await sha256(password + salt);
}
```

### Generating Checksums

```typescript
import { digest } from '@tundralibs/crypt/digest';

async function generateChecksum(data: Uint8Array): Promise<string> {
  // Use SHA-512 for stronger checksums
  return await digest(data, { algorithm: 'SHA-512', encoding: 'hex' });
}

const checksum = await generateChecksum(new Uint8Array([1, 2, 3, 4, 5]));
```

### Content Addressable Storage

```typescript
import { sha256 } from '@tundralibs/crypt/digest';

class ContentStore {
  private entries = new Map<string, string>();

  async store(content: string): Promise<string> {
    const hash = await sha256(content);
    this.entries.set(hash, content);
    return hash;
  }

  retrieve(hash: string): string | undefined {
    return this.entries.get(hash);
  }
}

const storage = new ContentStore();
const id = await storage.store('my content');
const content = storage.retrieve(id);
```

## Security Notes

### Algorithm Selection

- **SHA-256**: Recommended for general use (256-bit security)
- **SHA-384**: Higher security for sensitive data (384-bit security)
- **SHA-512**: Highest security level (512-bit security)
- **SHA-1**: ⚠️ **Deprecated** - Use only for legacy compatibility

### Output Lengths

| Algorithm | Hex Length | Base64 Length | Bits |
| --------- | ---------- | ------------- | ---- |
| SHA-1     | 40 chars   | ~27 chars     | 160  |
| SHA-256   | 64 chars   | ~44 chars     | 256  |
| SHA-384   | 96 chars   | ~64 chars     | 384  |
| SHA-512   | 128 chars  | ~88 chars     | 512  |

### Best Practices

1. **Don't use for passwords** - Use dedicated password hashing (Argon2, bcrypt, scrypt)
2. **Use SHA-256 minimum** - Avoid SHA-1 for new applications
3. **Add salt when needed** - For password hashing or unique identifiers
4. **Consider HMAC** - For message authentication (see [Crypt-Sign](../sign/Crypt-Sign.md))

---

[← Back to Crypt](../README.md)
