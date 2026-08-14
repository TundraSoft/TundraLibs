# Crypt-Encrypt

AES and RSA encryption and decryption using the Web Crypto API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Security Notes](#security-notes)

## Overview

The Encrypt module provides symmetric (AES) and asymmetric (RSA) encryption for secure data protection, plus the package's key-derivation functions: **PBKDF2** (slow, salted password stretching) and **HKDF** (RFC 5869, fast sub-key derivation for domain separation).

### Features

| Feature         | Bun | Deno | Node.js |
| --------------- | --- | ---- | ------- |
| AES-GCM         | ✅  | ✅   | ✅      |
| AES-CBC         | ✅  | ✅   | ✅      |
| AES-CTR         | ✅  | ✅   | ✅      |
| RSA-OAEP        | ✅  | ✅   | ✅      |
| 128/192/256-bit | ✅  | ✅   | ✅      |
| Binary data     | ✅  | ✅   | ✅      |
| PBKDF2          | ✅  | ✅   | ✅      |
| HKDF (RFC 5869) | ✅  | ✅   | ✅      |

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

### `encryptAES()`

Encrypts data using AES encryption.

**Signature:**

```typescript ignore
async function encryptAES(
  data: string | Uint8Array,
  secret: string,
  options?: AESOptions,
): Promise<string>;
```

**Parameters:**

- `data` - Data to encrypt
- `secret` - Secret of any length; the AES key is derived from it with PBKDF2-SHA-256 + a fresh per-message salt (see [Key Derivation](#key-derivation))
- `options`:
  - `mode?: 'GCM' | 'CBC' | 'CTR'` - Encryption mode (default: `'GCM'`)
  - `keyLength?: 128 | 192 | 256` - Key length in bits (default: `256`)

**Returns:** Encrypted data as a hex-string envelope — `{ciphertext}:{iv}:{salt}` for GCM, and `{ciphertext}:{iv}:{salt}:{mac}` for CBC/CTR (the 4th part is the encrypt-then-MAC HMAC)

> The output includes a fresh random salt for key derivation, so repeated encryptions with the same secret produce different ciphertexts. Both the IV and the salt are required to decrypt and are embedded in the envelope — store the returned string verbatim.

**Example:**

```typescript
import { encryptAES } from '@tundralibs/crypt/encrypt';

const encrypted = await encryptAES('sensitive data', 'mySecretKey', {
  mode: 'GCM',
  keyLength: 256,
});
```

### `decryptAES()`

Decrypts AES-encrypted data.

**Signature:**

```typescript ignore
async function decryptAES(
  data: string,
  secret: string,
  options?: AESOptions,
): Promise<string>;

async function decryptAES(
  data: string,
  secret: string,
  options: AESOptions & { returnBinary: true },
): Promise<Uint8Array>;
```

**Parameters:**

- `data` - Encrypted data from `encryptAES()`; expects the full hex envelope verbatim — `ciphertext:iv:salt` for GCM, or `ciphertext:iv:salt:mac` for CBC/CTR.
- `secret` - Secret key (must match encryption key)
- `options`:
  - `mode?: 'GCM' | 'CBC' | 'CTR'` - Encryption mode
  - `keyLength?: 128 | 192 | 256` - Key length in bits
  - `returnBinary?: boolean` - Return Uint8Array instead of string

**Returns:** Decrypted data as string or Uint8Array

**Example:**

```typescript
import { decryptAES } from '@tundralibs/crypt/encrypt';

declare const encrypted: string;

const decrypted = await decryptAES(encrypted, 'mySecretKey');
console.log(decrypted); // 'sensitive data'
```

### `encryptRSA()`

Encrypts data using RSA-OAEP.

**Signature:**

```typescript ignore
async function encryptRSA(
  data: string | Uint8Array,
  publicKey: string,
  options?: RSAOptions,
): Promise<string>;
```

**Parameters:**

- `data` - Data to encrypt
- `publicKey` - PEM-formatted RSA public key. The key size is read from the
  key itself; the OAEP plaintext limit (`modulus/8 - 2*hashLen - 2` bytes) is
  enforced against the actual modulus.
- `options`:
  - `hashAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'` - OAEP hash (default: `'SHA-256'`)

**Returns:** Base64-encoded encrypted data

**Example:**

```typescript
import { encryptRSA } from '@tundralibs/crypt/encrypt';

const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`;

const encrypted = await encryptRSA('secret message', publicKey);
```

### `decryptRSA()`

Decrypts RSA-OAEP encrypted data.

**Signature:**

```typescript ignore
async function decryptRSA(
  data: string,
  privateKey: string,
  options?: RSAOptions,
): Promise<string>;

async function decryptRSA(
  data: string,
  privateKey: string,
  options: RSAOptions & { returnBinary: true },
): Promise<Uint8Array>;
```

**Parameters:**

- `data` - Base64-encoded encrypted data from `encryptRSA()`
- `privateKey` - PEM-formatted RSA private key (the key size comes from the key)
- `options`:
  - `hashAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'` - OAEP hash (must match encryption)
  - `returnBinary?: boolean` - Return Uint8Array

**Returns:** Decrypted data

**Example:**

```typescript
import { decryptRSA } from '@tundralibs/crypt/encrypt';

declare const encrypted: string;

const privateKey = `-----BEGIN PRIVATE KEY-----...`;
const decrypted = await decryptRSA(encrypted, privateKey);
```

### `hkdf()`

Derive independent sub-keys from a single high-entropy secret using HKDF
(RFC 5869). Unlike `pbkdf2` — a deliberately slow password stretcher — HKDF
is fast and is the correct primitive for **domain separation**: vary the
`info` label to get keys for distinct purposes from the same secret, with
the guarantee that no derived key reveals the secret or any sibling key.
Prefer it over ad-hoc `secret + label` concatenation.

```typescript ignore
hkdf(
  ikm: string | Uint8Array,
  options?: {
    salt?: string | Uint8Array;
    info?: string | Uint8Array;
    length?: number; // bytes, default 32
    hash?: 'SHA-256' | 'SHA-384' | 'SHA-512'; // default 'SHA-256'
  },
): Promise<Uint8Array>
```

**Parameters:**

- `ikm` - Input keying material (the shared high-entropy secret). Not for
  low-entropy passwords — use `pbkdf2Hash` for those.
- `options.salt` - Optional salt (HKDF-Extract). Defaults to empty, which is
  fine when `ikm` is already high-entropy.
- `options.info` - Context/application label; the domain-separation tag. Two
  calls that differ only in `info` yield independent keys.
- `options.length` - Output length in **bytes** (default 32; max
  255 × hash-length).
- `options.hash` - Underlying digest (default `'SHA-256'`).

**Returns:** The derived key material as a `Uint8Array`.

**Throws:**

- `RangeError` - When `length` is not an integer in `1..255×hashLen`.

**Example:**

```typescript
import { hkdf } from '@tundralibs/crypt/encrypt';

declare const secret: Uint8Array;

// Two independent keys from one secret — signing vs MAC.
const signKey = await hkdf(secret, { info: 'jwt' });
const macKey = await hkdf(secret, { info: 'hmac' });
// signKey and macKey are unrelated; neither leaks `secret`.
```

For low-entropy passwords, reach for the salted, slow `pbkdf2Hash` /
`pbkdf2Verify` instead — see [Key Derivation](#key-derivation).

## Examples

### Simple AES Encryption

```typescript
import { decryptAES, encryptAES } from '@tundralibs/crypt/encrypt';

// Encrypt
const secret = 'my-secret-key-12345';
const data = 'Hello, World!';
const encrypted = await encryptAES(data, secret);

// Decrypt
const decrypted = await decryptAES(encrypted, secret);
console.log(decrypted); // 'Hello, World!'
```

### Different AES Modes

```typescript
import { decryptAES, encryptAES } from '@tundralibs/crypt/encrypt';

// AES-GCM (recommended)
const gcm = await encryptAES('data', 'key', { mode: 'GCM' });

// AES-CBC
const cbc = await encryptAES('data', 'key', { mode: 'CBC' });

// AES-CTR
const ctr = await encryptAES('data', 'key', { mode: 'CTR' });
```

### RSA Encryption with Key Generation

```typescript
import { decryptRSA, encryptRSA } from '@tundralibs/crypt/encrypt';
import { generateRSAKeyPair } from '@tundralibs/crypt/generators';

// Generate key pair (PEM-exported)
const keys = await generateRSAKeyPair({
  algorithm: 'RSA-OAEP',
  keySize: 2048,
  hashAlgorithm: 'SHA-256',
  format: 'PEM',
});
const publicKey = keys.publicKeyExported as string;
const privateKey = keys.privateKeyExported as string;

// Encrypt with public key
const encrypted = await encryptRSA('secret message', publicKey);

// Decrypt with private key
const decrypted = await decryptRSA(encrypted, privateKey);
```

### Binary Data Encryption

```typescript
import { decryptAES, encryptAES } from '@tundralibs/crypt/encrypt';

// Encrypt binary data
const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
const encrypted = await encryptAES(binaryData, 'secret');

// Decrypt back to binary
const decrypted = await decryptAES(encrypted, 'secret', {
  returnBinary: true,
});
```

## Security Notes

### AES Mode Selection

All three modes are authenticated — you never need to add your own MAC.

- **AES-GCM** ✅ Recommended - AEAD; authenticated on its own (embeds an auth
  tag).
- **AES-CBC** ✅ Authenticated automatically - `encryptAES` wraps it with
  encrypt-then-MAC (HMAC-SHA-256 over the `data:iv:salt` envelope, appended as
  a 4th `:mac` component), and `decryptAES` verifies it constant-time before
  decrypting. Use only for external-format compatibility; prefer GCM.
- **AES-CTR** ✅ Authenticated automatically - same encrypt-then-MAC wrapping
  and constant-time verification as CBC. Use only for external-format
  compatibility; prefer GCM.

### IV / Nonce Lengths

GCM envelopes carry the standard 12-byte (96-bit) nonce; CBC uses a 16-byte
block IV and CTR a 16-byte counter block. `decryptAES()` reads the IV length
from the envelope itself, so ciphertexts produced by older versions of this
package (which used a 16-byte GCM IV) continue to decrypt unchanged.

### Key Length

- **256-bit** - Recommended for maximum security
- **192-bit** - Good balance of security and performance
- **128-bit** - Minimum recommended

### Key Derivation

The AES key is derived from the caller-supplied `secret` using **PBKDF2-SHA-256 at 210,000 iterations** (current OWASP guidance for SHA-256) with a fresh 16-byte random salt generated per encryption. The salt is embedded in the ciphertext envelope so `decryptAES()` can re-derive the same key from `secret`.

Implications:

- **Any secret length works.** Short or unusual secrets are no longer zero-padded to fit the AES key size — they go through PBKDF2 like everything else.
- **Each encryption is non-deterministic.** Two calls with the same plaintext + secret produce different ciphertexts because the salt (and IV) are fresh each time.
- **Decryption requires the full envelope.** The `salt` is not optional and not recoverable from `secret` alone; if the envelope is truncated to `ciphertext:iv`, decrypt will reject it with `Invalid encrypted data format`.
- **Cost is intentional.** PBKDF2 derivation is the dominant cost of each `encryptAES`/`decryptAES` call (tens of milliseconds). If you are encrypting many small values with the same secret, batching at a higher layer is recommended.

For raw, deterministic key derivation (e.g., to derive AES key material once and reuse a `CryptoKey` across many ciphertexts in the same process), use the exported `pbkdf2` from `@tundralibs/crypt/encrypt`. With a fixed salt it derives the same bytes every call, so you import the key once and reuse it:

```typescript
import { pbkdf2, PBKDF2_ITERATIONS } from '@tundralibs/crypt/encrypt';

// A fixed salt makes derivation deterministic — store it alongside the secret.
const salt = new Uint8Array(16).fill(7);
const raw = await pbkdf2('mySecret', salt, PBKDF2_ITERATIONS, 256); // 32 bytes

const key = await crypto.subtle.importKey(
  'raw',
  raw as BufferSource,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);
// Reuse `key` directly with crypto.subtle.encrypt/decrypt across many messages.
```

**Choosing a KDF.** The module exports two derivation families for different jobs — pick by the entropy of your input, not by convenience:

- **PBKDF2 (`pbkdf2Hash` / `pbkdf2Verify`, `pbkdf2`)** — for **low-entropy secrets** (user passwords). Deliberately slow and salted so brute-forcing a stolen hash stays expensive. `pbkdf2Hash` returns a self-describing `pbkdf2-<hash>$<iterations>$<salt>$<derived>` string that `pbkdf2Verify` checks (and never throws on malformed input, returning `false`).
- **HKDF (`hkdf`)** — for **high-entropy secrets** you already trust (a master key, a shared secret). Fast, and built for **domain separation**: derive many independent sub-keys from one secret by varying `info`. Do **not** use it to stretch passwords — it provides no work factor.

### RSA Considerations

- **Minimum 2048-bit keys** - 1024-bit keys are insecure
- **Size limits** - RSA can only encrypt data smaller than key size
- **Use hybrid encryption** - RSA for key, AES for data
- **SHA-256 or higher** - Avoid SHA-1 for OAEP

### Best Practices

1. Use AES-GCM for symmetric encryption.
2. Use minimum 2048-bit RSA keys.
3. Store the envelope returned by `encryptAES` verbatim — IV and salt are part of it.
4. Treat `secret` as you would any password: keep it out of source, rotate it, and don't log it.
5. Use hybrid encryption (RSA for the key, AES for the data) for payloads larger than the RSA key can carry.

---

[← Back to Crypt](../README.md)
