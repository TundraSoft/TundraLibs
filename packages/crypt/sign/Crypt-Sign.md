# Crypt-Sign

HMAC, RSA (PSS / PKCS#1 v1.5) and ECDSA digital signatures using the Web Crypto API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

Digital signature functions for message authentication and integrity verification.

### Features

| Feature               | Bun | Deno | Node.js |
| --------------------- | --- | ---- | ------- |
| HMAC-SHA-256          | ✅  | ✅   | ✅      |
| HMAC-SHA-512          | ✅  | ✅   | ✅      |
| RSA-PSS               | ✅  | ✅   | ✅      |
| RSA-PKCS#1 v1.5       | ✅  | ✅   | ✅      |
| ECDSA (P-256/384/521) | ✅  | ✅   | ✅      |
| Binary data           | ✅  | ✅   | ✅      |
| `CryptoKey` / JWK in  | ✅  | ✅   | ✅      |

### Key input

Every function accepts a `SigningKey` — the same three forms everywhere:

| Form         | Use                                                             |
| ------------ | --------------------------------------------------------------- |
| `string`     | PEM-armoured asymmetric key, or a raw secret for HMAC           |
| `CryptoKey`  | An already-imported Web Crypto key, used as-is                  |
| `JsonWebKey` | A JWK, e.g. an entry straight out of a provider's JWKS document |

A supplied `CryptoKey` or JWK is **validated against the operation**, not
trusted: family, curve, hash, public/private type and usages must all permit
what is being asked, and a JWK's own `alg`, `use` and `key_ops` must not
contradict it. See [Security notes](#security-notes).

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

### `signHMAC()`

Creates an HMAC signature.

```typescript
async function signHMAC(
  data: string | Uint8Array,
  secret: SigningKey,
  options?: HMACOptions,
): Promise<string>;
```

**Example:**

```typescript
import { signHMAC } from '@tundralibs/crypt/sign';

const signature = await signHMAC('my data', 'secret-key');
console.log(signature); // hex string
```

### `verifyHMAC()`

Verifies an HMAC signature.

```typescript
async function verifyHMAC(
  data: string | Uint8Array,
  signature: string,
  secret: SigningKey,
  options?: HMACOptions,
): Promise<boolean>;
```

**Example:**

```typescript
import { verifyHMAC } from '@tundralibs/crypt/sign';

const isValid = await verifyHMAC('my data', signature, 'secret-key');
console.log(isValid); // true or false
```

### `signRSA()`

Creates an RSA-PSS signature.

```typescript
async function signRSA(
  data: string | Uint8Array,
  privateKey: SigningKey,
  options?: RSAOptions,
): Promise<string>;
```

**Example:**

```typescript
import { signRSA } from '@tundralibs/crypt/sign';

const privateKey = `-----BEGIN PRIVATE KEY-----...`;
const signature = await signRSA('my data', privateKey);
```

### `verifyRSA()`

Verifies an RSA-PSS signature.

```typescript
async function verifyRSA(
  data: string | Uint8Array,
  signature: string,
  publicKey: SigningKey,
  options?: RSAOptions,
): Promise<boolean>;
```

**Example:**

```typescript
import { verifyRSA } from '@tundralibs/crypt/sign';

const publicKey = `-----BEGIN PUBLIC KEY-----...`;
const isValid = await verifyRSA('my data', signature, publicKey);
```

### `signEC()`

Creates an ECDSA signature on a NIST P-curve.

```typescript
async function signEC(
  data: string | Uint8Array,
  privateKey: SigningKey,
  options?: ECOptions,
): Promise<string>;
```

The returned base64 decodes to the **raw `R‖S` concatenation** required by
RFC 7515 §3.4 — never ASN.1/DER. See
[Signature encoding](#signature-encoding-rs-not-der).

Curve and hash both default to whatever the key commits to: the curve is read
from the key material, and the hash follows the RFC 7518 pairing for that curve.
`options.curve` _pins_ the expectation rather than selecting one — a key on a
different curve is rejected, not coerced.

**Example:**

```typescript
import { signEC } from '@tundralibs/crypt/sign';

const privateKey = `-----BEGIN PRIVATE KEY-----...`;
const signature = await signEC('my data', privateKey);

// Pin the curve — a key on any other curve is refused
const pinned = await signEC('my data', privateKey, { curve: 'P-256' });
```

### `verifyEC()`

Verifies an ECDSA signature.

```typescript
async function verifyEC(
  data: string | Uint8Array,
  signature: string,
  publicKey: SigningKey,
  options?: ECOptions,
): Promise<boolean>;
```

**Example:**

```typescript
import { verifyEC } from '@tundralibs/crypt/sign';

const publicKey = `-----BEGIN PUBLIC KEY-----...`;
const isValid = await verifyEC('my data', signature, publicKey);
```

### Signature encoding: `R‖S`, not DER

ECDSA signatures have two incompatible encodings in common use:

| Encoding    | Shape                               | Used by                                |
| ----------- | ----------------------------------- | -------------------------------------- |
| Raw `R‖S`   | Fixed width, bare                   | JOSE / JWS (RFC 7515 §3.4), Web Crypto |
| ASN.1 / DER | `SEQUENCE { INTEGER r, INTEGER s }` | OpenSSL, most non-web tooling          |

`signEC` emits **only** `R‖S` and `verifyEC` accepts **only** `R‖S`; a DER
signature returns `false` rather than verifying. Convert at the boundary if you
are bridging DER-based tooling.

Widths are fixed by the curve:

| Curve   | JOSE `alg` | Hash    | `R‖S` bytes |
| ------- | ---------- | ------- | ----------- |
| `P-256` | `ES256`    | SHA-256 | 64          |
| `P-384` | `ES384`    | SHA-384 | 96          |
| `P-521` | `ES512`    | SHA-512 | **132**     |

Note the last row: **`ES512` uses P-521**, not a nonexistent "P-512". The
algorithm is named for its hash, the curve for its field size — and 521 bits
rounds up to 66 bytes per half, hence 132 rather than 128.

### Supported key formats

| Format                         | Sign | Verify | Notes                              |
| ------------------------------ | ---- | ------ | ---------------------------------- |
| PEM `PRIVATE KEY` (PKCS#8)     | ✅   | —      | Includes Apple's `.p8`             |
| PEM `PUBLIC KEY` (SPKI)        | —    | ✅     |                                    |
| PEM `EC PRIVATE KEY` (SEC1)    | ✅   | —      | Rewrapped as PKCS#8 automatically  |
| `CryptoKey`                    | ✅   | ✅     | Used as-is; may be non-extractable |
| JWK (`JsonWebKey`)             | ✅   | ✅     | `EC`, `RSA` and `oct`              |
| Raw secret string              | ✅   | ✅     | HMAC only                          |
| PEM `ENCRYPTED PRIVATE KEY`    | ❌   | ❌     | Decrypt first — see below          |
| PEM `RSA PRIVATE KEY` (PKCS#1) | ❌   | ❌     | Not importable by Web Crypto       |
| PEM `RSA PUBLIC KEY` (PKCS#1)  | ❌   | ❌     | Not importable by Web Crypto       |
| X.509 `CERTIFICATE`            | ❌   | ❌     | Extract the public key first       |

Web Crypto imports only PKCS#8, SPKI, JWK and raw, so the unsupported rows are
platform limits rather than choices. Convert with OpenSSL:

```bash
# Encrypted → plaintext PKCS#8
openssl pkcs8 -topk8 -nocrypt -in encrypted.pem -out key.pem

# PKCS#1 RSA → PKCS#8
openssl pkcs8 -topk8 -nocrypt -in pkcs1.pem -out pkcs8.pem

# Certificate → public key
openssl x509 -in cert.pem -pubkey -noout -out pub.pem
```

## Examples

### HMAC Message Authentication

```typescript
import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';

const secret = 'shared-secret-key';
const message = 'Important message';

// Sign
const signature = await signHMAC(message, secret);

// Verify
const isAuthentic = await verifyHMAC(message, signature, secret);
console.log(isAuthentic); // true
```

### RSA Digital Signatures

```typescript
import { signRSA, verifyRSA } from '@tundralibs/crypt/sign';
import { generateRSAKeyPair } from '@tundralibs/crypt/generators';

// Generate key pair (PEM-exported). The key size lives in the key itself —
// signRSA/verifyRSA take no size option.
const keys = await generateRSAKeyPair({
  algorithm: 'RSA-PSS',
  keySize: 2048,
  hashAlgorithm: 'SHA-256',
  format: 'PEM',
});
const publicKey = keys.publicKeyExported as string;
const privateKey = keys.privateKeyExported as string;

// Sign with private key (RSA-PSS by default; pass { scheme: 'PKCS1' } for
// RSASSA-PKCS1-v1_5)
const signature = await signRSA('document', privateKey);

// Verify with public key
const isValid = await verifyRSA('document', signature, publicKey);
```

### ECDSA Digital Signatures

```typescript
import { signEC, verifyEC } from '@tundralibs/crypt/sign';
import { generateECKeyPair } from '@tundralibs/crypt/generators';

const keys = await generateECKeyPair({
  algorithm: 'ECDSA',
  curve: 'P-256',
  format: 'PEM',
});

// Curve and hash come from the key (P-256 → SHA-256)
const signature = await signEC('document', keys.privateKeyExported as string);
const isValid = await verifyEC(
  'document',
  signature,
  keys.publicKeyExported as string,
);
```

### Verifying with a JWK from a JWKS endpoint

```typescript
import { verifyEC } from '@tundralibs/crypt/sign';

const { keys } = await (await fetch(jwksUri)).json();
const jwk = keys.find((k) => k.kid === kid);

// No PEM conversion: the JWK is used directly, and its own alg/use/key_ops
// are checked against the operation before any signature is examined.
const isValid = await verifyEC('payload', signature, jwk, { curve: 'P-256' });
```

## Security Notes

- HMAC requires a shared secret
- RSA requires minimum 2048-bit keys
- Use SHA-256 or higher hash algorithms
- Never expose private keys

### Key validation

Accepting a `CryptoKey` or JWK means the key's metadata is no longer implied by
the code path, so it is checked rather than trusted. A key is refused when:

- its **family** does not match the operation (an EC key offered to `verifyRSA`,
  a public key offered as an HMAC secret);
- its **curve** is not the pinned one — verifying an `ES256` signature with a
  P-384 key fails as a _key_ error, distinguishable from a bad signature;
- its **hash** disagrees, for the RSA and HMAC keys that bind one at import;
- it is the wrong **type** for the job — a private key handed to a verifier, or
  a public key asked to sign;
- its **usages** do not include the operation;
- a JWK's declared `alg`, `use`, `key_ops`, `kty` or `crv` contradicts the
  operation (RFC 7517 §4.1–4.4).

### ECDSA specifics

- Each `ES*` algorithm binds exactly one curve. Never verify a signature with a
  key on a different curve, and prefer pinning `options.curve` when the expected
  curve is known.
- Only `R‖S` is accepted. A DER signature returns `false` — this is deliberate,
  so one signature cannot have two valid spellings.
- ECDSA requires a unique random nonce per signature; the Web Crypto
  implementation handles this. Two signatures over the same data will differ,
  which is expected, not a bug.

---

[← Back to Crypt](../README.md)
