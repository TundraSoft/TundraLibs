# Crypt

Cross-runtime cryptography for Deno, Bun, and Node.js — hashing, AES/RSA encryption, HMAC/RSA/ECDSA/Ed25519 signing, JWT, OTP (TOTP/HOTP), key derivation, and secure random.

[![JSR](https://jsr.io/badges/@tundralibs/crypt)](https://jsr.io/@tundralibs/crypt)
[![JSR Score](https://jsr.io/badges/@tundralibs/crypt/score)](https://jsr.io/@tundralibs/crypt)
![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Overview

The Crypt package provides battle-tested cryptographic operations using the native Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`) — no `node:crypto`, no native bindings. All functions are runtime-agnostic and work seamlessly across Deno, Bun, Node.js, Cloudflare Workers, and browsers.

## Modules

| Module                                       | Description                                                  | Documentation                          |
| -------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| [Digest](digest/Crypt-Digest.md)             | Hashing (SHA-1/256/384/512) + PBKDF2 password storage        | [Docs](digest/Crypt-Digest.md)         |
| [Encrypt](encrypt/Crypt-Encrypt.md)          | AES/RSA encryption                                           | [Docs](encrypt/Crypt-Encrypt.md)       |
| [Sign](sign/Crypt-Sign.md)                   | HMAC, RSA, ECDSA and Ed25519 digital signatures              | [Docs](sign/Crypt-Sign.md)             |
| [Generators](generators/Crypt-Generators.md) | Key pairs, key derivation (PBKDF2, HKDF), secrets, BIP39     | [Docs](generators/Crypt-Generators.md) |
| [JWT](JWT/Crypt-JWT.md)                      | JSON Web Token creation and verification (HS/RS/PS/ES/EdDSA) | [Docs](JWT/Crypt-JWT.md)               |
| [JWT Errors](JWT/errors/Crypt-JWT-Errors.md) | `JWTError` and its 12 stable error codes                     | [Docs](JWT/errors/Crypt-JWT-Errors.md) |
| [OTP](OTP/Crypt-OTP.md)                      | Time-based and HMAC-based one-time passwords                 | [Docs](OTP/Crypt-OTP.md)               |
| [CBOR](cbor/Crypt-CBOR.md)                   | Minimal CBOR decoder + COSE-key → JWK (WebAuthn)             | [Docs](cbor/Crypt-CBOR.md)             |

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

## Quick Start

### Hashing

```typescript
import { digest, sha256 } from '@tundralibs/crypt/digest';

// Quick SHA-256 hash
const hash = await sha256('my data');
console.log(hash); // hex string

// With custom algorithm
const hash384 = await digest('my data', { algorithm: 'SHA-384' });
```

### Encryption

```typescript
import { decryptAES, encryptAES } from '@tundralibs/crypt/encrypt';

// Encrypt with AES-GCM
const encrypted = await encryptAES('secret message', 'mySecretKey123456', {
  mode: 'GCM',
  keyLength: 256,
});

// Decrypt
const decrypted = await decryptAES(encrypted, 'mySecretKey123456');
console.log(decrypted); // 'secret message'
```

### Key Derivation

```typescript
import { pbkdf2Hash, pbkdf2Verify } from '@tundralibs/crypt/digest';
import { hkdf } from '@tundralibs/crypt/generators';

declare const masterSecret: Uint8Array;

// Passwords: slow, salted PBKDF2 (store the string, verify against it)
const stored = await pbkdf2Hash('correct horse battery staple');
const ok = await pbkdf2Verify('correct horse battery staple', stored); // true

// High-entropy secrets: HKDF for domain separation (fast, one secret → many keys)
const signKey = await hkdf(masterSecret, { info: 'jwt' });
const macKey = await hkdf(masterSecret, { info: 'hmac' }); // independent of signKey
```

### Digital Signatures

```typescript
import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';

// Sign data
const signature = await signHMAC('my data', 'secret');

// Verify signature
const isValid = await verifyHMAC('my data', signature, 'secret');
console.log(isValid); // true
```

ECDSA and RSA work the same way, and every function takes a PEM string, a
`CryptoKey`, or a JWK:

```typescript
import { signEC, verifyEC } from '@tundralibs/crypt/sign';

declare const ecPrivateKeyPEM: string;
declare const ecPublicKeyJWK: JsonWebKey;

// Curve and hash are read from the key (P-256 → SHA-256). The signature is
// the raw R‖S form JOSE requires, not DER.
const signature = await signEC('my data', ecPrivateKeyPEM);
const isValid = await verifyEC('my data', signature, ecPublicKeyJWK);
```

### JWT

```typescript
import { issueJWT, verifyJWT } from '@tundralibs/crypt/JWT';

// Create JWT
const token = await issueJWT(
  'HS256',
  { sub: '123', role: 'admin' },
  'jwt-secret-key',
);

// Verify JWT
const payload = await verifyJWT(token, 'jwt-secret-key', {
  algorithm: 'HS256',
});
console.log(payload.sub); // '123'

// RFC 9068 OAuth 2.0 access token (typ: 'at+jwt') — accepted by default,
// and `typ` can be pinned so only access tokens are honoured.
const accessToken = await issueJWT('HS256', { sub: '123' }, 'jwt-secret-key', {
  typ: 'at+jwt',
});
const claims = await verifyJWT(accessToken, 'jwt-secret-key', {
  algorithm: 'HS256',
  typ: 'at+jwt',
});
```

### OTP

```typescript
import { generateTOTP, verifyTOTP } from '@tundralibs/crypt/OTP';

const secret = 'JBSWY3DPEHPK3PXP';

// Generate time-based OTP (defaults: SHA-1, 6 digits, 30s period — the
// RFC 6238 interop defaults authenticator apps assume)
const otp = await generateTOTP(secret);
console.log(otp); // '123456'

// Verify OTP (±1 time step window by default)
const valid = await verifyTOTP(otp, secret);
console.log(valid); // true
```

### Random Generation

```typescript
import {
  generateBIP39Mnemonic,
  generateHexSecret,
  generateRSAKeyPair,
} from '@tundralibs/crypt/generators';

// Generate random secret
const secret = generateHexSecret(32); // 64 hex characters

// Generate RSA key pair (PEM-exported)
const keys = await generateRSAKeyPair({
  algorithm: 'RSA-OAEP',
  keySize: 2048,
  hashAlgorithm: 'SHA-256',
  format: 'PEM',
});
const publicKeyPEM = keys.publicKeyExported as string;
const privateKeyPEM = keys.privateKeyExported as string;

// Generate BIP39 mnemonic
const mnemonic = await generateBIP39Mnemonic({ wordCount: 12 });
console.log(mnemonic.phrase); // 'abandon ability able...'
```

## Features

- ✅ **Zero Dependencies** - Uses native Web Crypto API
- ✅ **Type Safe** - Full TypeScript support with strict types
- ✅ **Cross-Runtime** - Works on Deno, Bun, and Node.js
- ✅ **Well Tested** - Comprehensive test coverage
- ✅ **Standards Compliant** - Follows NIST, RFC, and BIP standards
- ✅ **Flexible Key Input** - PEM, `CryptoKey` or JWK anywhere a key is taken

## Security Notes

- All cryptographic operations use the native Web Crypto API
- AES-GCM is recommended for symmetric encryption (uses the standard 12-byte
  nonce; the envelope embeds the IV, so older ciphertexts written with a
  16-byte GCM IV still decrypt)
- RSA operations read the key size from the key itself; use at least
  2048-bit keys
- Signing and JWT verification bind the primitive to the _shape_ of the key, so
  an EC key can never verify an `RS*` token and a public key can never be used
  as an HMAC secret. Each `ES*` algorithm is additionally bound to one curve
  (`ES512` uses **P-521**), and a caller-supplied `CryptoKey` or JWK is
  validated against the operation rather than trusted
- SHA-1 is deprecated for signatures (use SHA-256 or higher). OTP is the
  deliberate exception: TOTP/HOTP default to SHA-1 because that is the
  RFC 4226/6238 interop default authenticator apps assume
- Always use cryptographically secure random number generation
- JWT tokens should be stored securely and transmitted over HTTPS

## License

MIT
