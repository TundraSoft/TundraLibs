# Crypt-Digest

Cryptographic hashing and salted PBKDF2 password hashing using the Web Crypto API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
  - [digest()](#digest)
  - [sha256()](#sha256)
  - [sha512()](#sha512)
  - [sha384()](#sha384)
  - [sha1()](#sha1)
  - [pbkdf2Hash()](#pbkdf2hash)
  - [pbkdf2Verify()](#pbkdf2verify)
  - [pbkdf2()](#pbkdf2)
- [Examples](#examples)
- [Security Notes](#security-notes)

## Overview

The Digest module provides cryptographic hash functions for creating fixed-size digests from arbitrary data, plus **salted PBKDF2 password hashing** (`pbkdf2Hash` / `pbkdf2Verify`) for at-rest password storage. All functions use the native Web Crypto API for secure, standards-compliant hashing.

### Features

| Feature         | Bun | Deno | Node.js | Workers | Browser |
| --------------- | --- | ---- | ------- | ------- | ------- |
| SHA-1           | ✅  | ✅   | ✅      | ✅      | ✅      |
| SHA-256         | ✅  | ✅   | ✅      | ✅      | ✅      |
| SHA-384         | ✅  | ✅   | ✅      | ✅      | ✅      |
| SHA-512         | ✅  | ✅   | ✅      | ✅      | ✅      |
| Hex encoding    | ✅  | ✅   | ✅      | ✅      | ✅      |
| Base64 encoding | ✅  | ✅   | ✅      | ✅      | ✅      |
| Binary input    | ✅  | ✅   | ✅      | ✅      | ✅      |
| PBKDF2 (salted) | ✅  | ✅   | ✅      | ✅      | ✅      |

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

> The root package barrel also exports a `hash()` alias — `hash(data)` is
> exactly `sha256(data)`, hex-encoded. It exists **only** on
> `@tundralibs/crypt`, not on this `@tundralibs/crypt/digest` subpath:
> `import { hash } from '@tundralibs/crypt'`.

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

### `pbkdf2Hash()`

Hash a password with **salted** PBKDF2 for at-rest storage. Returns a
self-describing `pbkdf2-<hash>$<iterations>$<salt-hex>$<hash-hex>` string that
carries everything `pbkdf2Verify` needs. Iterations default to the
digest-aware `PBKDF2_PASSWORD_ITERATIONS` (600,000 for the default SHA-256,
210,000 for SHA-384/512, per current OWASP guidance); the stored string
records its count, so raising a default never breaks old hashes.

Unlike a bare `digest()`, the random salt makes every hash of the same
password unique, so the output **cannot be matched by equality** — you verify
a candidate, you do not look a user up by their password hash.

```typescript ignore
pbkdf2Hash(
  password: string,
  opts?: { iterations?: number; hash?: 'SHA-256' | 'SHA-384' | 'SHA-512' },
): Promise<string>
```

**Example:**

```typescript
import { pbkdf2Hash, pbkdf2Verify } from '@tundralibs/crypt/digest';

const stored = await pbkdf2Hash('correct horse battery staple');
const ok = await pbkdf2Verify('correct horse battery staple', stored); // true
```

### `pbkdf2Verify()`

Verify a password against a `pbkdf2Hash` output. Constant-time on the digest
comparison; returns `false` on any malformed or unrecognised input rather
than throwing.

```typescript ignore
pbkdf2Verify(password: string, stored: string): Promise<boolean>
```

### `pbkdf2()`

Low-level PBKDF2 derivation to raw bytes — the primitive `pbkdf2Hash` builds
on. The salt (see `SALT_BYTES`, 16) must be stored to re-derive.

```typescript ignore
pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bits?: number, // default 256
  hash?: 'SHA-256' | 'SHA-384' | 'SHA-512', // default 'SHA-256'
): Promise<Uint8Array>
```

For deriving a ready-to-use AES `CryptoKey` or fast HKDF sub-keys, see
[Generators](../generators/Crypt-Generators.md) (`derivePBKDF2Key`, `hkdf`).

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

### Password Hashing

```typescript
import { pbkdf2Hash, pbkdf2Verify } from '@tundralibs/crypt/digest';

// ⚠️ Never store a bare SHA digest of a password — use the salted,
// deliberately slow PBKDF2 pair instead.
const stored = await pbkdf2Hash('hunter2'); // pbkdf2-sha256$600000$…
const ok = await pbkdf2Verify('hunter2', stored); // true
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

The per-algorithm byte lengths are exported as `DIGEST_OUTPUT_BYTES`
(e.g. `DIGEST_OUTPUT_BYTES['SHA-256']` → `32`).

### Best Practices

1. **Don't store bare digests of passwords** - Use the salted `pbkdf2Hash` / `pbkdf2Verify` pair
2. **Use SHA-256 minimum** - Avoid SHA-1 for new applications
3. **Add salt when needed** - For password hashing or unique identifiers
4. **Consider HMAC** - For message authentication (see [Crypt-Sign](../sign/Crypt-Sign.md))

---

[← Back to Crypt](../README.md)
