# Crypt-Generators

Cryptographic key pair generation, key derivation (PBKDF2, HKDF), random secrets, and BIP39 mnemonics.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Overview

Secure generation of cryptographic keys, derived keys (PBKDF2, HKDF), random secrets, and mnemonic phrases.

### Features

| Feature         | Bun | Deno | Node.js | Workers | Browser |
| --------------- | --- | ---- | ------- | ------- | ------- |
| RSA key pairs   | ✅  | ✅   | ✅      | ✅      | ✅      |
| EC key pairs    | ✅  | ✅   | ✅      | ✅      | ✅      |
| Ed25519 pairs   | ✅  | ✅   | ✅      | ✅      | ✅      |
| Random secrets  | ✅  | ✅   | ✅      | ✅      | ✅      |
| Random numbers  | ✅  | ✅   | ✅      | ✅      | ✅      |
| BIP39 mnemonics | ✅  | ✅   | ✅      | ✅      | ✅      |
| PEM/JWK export  | ✅  | ✅   | ✅      | ✅      | ✅      |
| PBKDF2 / HKDF   | ✅  | ✅   | ✅      | ✅      | ✅      |

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

### Key Pair Generation

#### `generateRSAKeyPair()`

Generates RSA key pairs for encryption or signing.

```typescript ignore
async function generateRSAKeyPair(
  options: RSAKeyOptions,
): Promise<GeneratedKeyPair>;

interface RSAKeyOptions {
  algorithm: 'RSA-OAEP' | 'RSA-PSS';
  keySize?: 2048 | 3072 | 4096; // defaults to 2048
  hashAlgorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512'; // defaults to 'SHA-256'
  format?: 'PEM' | 'DER' | 'JWK'; // 'RAW' is rejected for RSA — see below
  extractable?: boolean;
}
```

> `format: 'RAW'` throws — RSA keys have no raw encoding in Web Crypto. `RAW`
> only works for EC keys (see [`generateECKeyPair()`](#generateeckeypair)
> below), where it exports the public key alone.

**Example:**

```typescript
import { generateRSAKeyPair } from '@tundralibs/crypt/generators';

const { publicKey, privateKey, publicKeyExported, privateKeyExported } =
  await generateRSAKeyPair({
    algorithm: 'RSA-OAEP',
    keySize: 2048,
    hashAlgorithm: 'SHA-256',
    format: 'PEM',
  });
```

#### `generateECKeyPair()`

Generates elliptic curve key pairs.

```typescript ignore
async function generateECKeyPair(
  options: ECKeyOptions,
): Promise<GeneratedKeyPair>;

interface ECKeyOptions {
  algorithm: 'ECDSA' | 'ECDH';
  curve: 'P-256' | 'P-384' | 'P-521';
  format?: 'PEM' | 'DER' | 'JWK' | 'RAW';
  extractable?: boolean;
}
```

> `format: 'RAW'` is public-key-only: it exports `publicKeyExported` as the
> uncompressed curve point and leaves `privateKeyExported` **undefined** —
> there is no raw encoding for an EC private key. Use it when you only need to
> hand the public key to a peer (e.g. for ECDH agreement); use `'PEM'` or
> `'JWK'` when you need both halves.

**Example:**

```typescript
import { generateECKeyPair } from '@tundralibs/crypt/generators';

const { publicKeyExported, privateKeyExported } = await generateECKeyPair({
  algorithm: 'ECDSA',
  curve: 'P-256',
  format: 'JWK',
});
```

#### `generateEd25519Keys()`

Generates an Ed25519 key pair for `signEd25519`/`verifyEd25519` and the JWT
`EdDSA` algorithm. Nothing is configurable — curve and digest are fixed by
Ed25519 itself (RFC 8032); the keys are always extractable.

```typescript ignore
generateEd25519Keys(format?: KeyFormat): Promise<GeneratedKeyPair>
```

`'RAW'` exports the public key alone (its 32 bytes), leaving
`privateKeyExported` undefined. Also reachable as
`generateKeyPair('Ed25519', format)`.

```typescript
import { generateEd25519Keys } from '@tundralibs/crypt/generators';

const { publicKeyExported } = await generateEd25519Keys('PEM');
console.log(publicKeyExported); // -----BEGIN PUBLIC KEY----- …
```

#### Convenience presets

`generateRSAKeyPair()` and `generateECKeyPair()` take every option explicitly;
five presets skip the boilerplate for the pairings the rest of this package
actually consumes. All of them **always generate extractable keys** — call
the underlying function directly if you need a non-extractable `CryptoKey`.

```typescript ignore
function generateKeyPair(
  algorithm: 'RSA-OAEP' | 'RSA-PSS' | 'ECDSA' | 'ECDH',
  format?: 'PEM' | 'DER' | 'JWK' | 'RAW',
): Promise<GeneratedKeyPair>; // RSA-OAEP/RSA-PSS: 2048-bit, SHA-256; ECDSA/ECDH: P-256

function generateRSAEncryptionKeys(
  keySize?: 2048 | 3072 | 4096, // default 2048
  format?: 'PEM' | 'DER' | 'JWK',
): Promise<GeneratedKeyPair>; // RSA-OAEP + SHA-256, for encryptRSA/decryptRSA

function generateRSASigningKeys(
  keySize?: 2048 | 3072 | 4096, // default 2048
  format?: 'PEM' | 'DER' | 'JWK',
): Promise<GeneratedKeyPair>; // RSA-PSS + SHA-256, for the PS* side of signRSA/verifyRSA

function generateECDSAKeys(
  curve?: 'P-256' | 'P-384' | 'P-521', // default 'P-256'
  format?: 'PEM' | 'DER' | 'JWK' | 'RAW',
): Promise<GeneratedKeyPair>; // for signEC/verifyEC

function generateECDHKeys(
  curve?: 'P-256' | 'P-384' | 'P-521', // default 'P-256'
  format?: 'PEM' | 'DER' | 'JWK' | 'RAW',
): Promise<GeneratedKeyPair>; // deriveKey usage only — see below
```

> `generateRSASigningKeys()` and `generateRSAEncryptionKeys()` produce keys for
> two different RSA primitives. A `generateRSASigningKeys()` key is RSA-PSS —
> it can sign `PS*` but is refused for `RS*` (PKCS#1 v1.5); it is also the
> wrong shape for `encryptRSA`/`decryptRSA`, which need an `RSA-OAEP` key.
> Reach for `generateRSAEncryptionKeys()` for encryption and
> `generateRSASigningKeys()` for signing — never the same key pair for both.

> `generateECDHKeys()` grants the private key `deriveKey` usage only, so
> `crypto.subtle.deriveBits` rejects it directly — derive a `CryptoKey` with
> `deriveKey` and export that if you need raw shared-secret bytes. Both sides
> of an exchange must agree on the curve; a P-256 key cannot derive against a
> P-384 one.

**Example:**

```typescript
import {
  generateECDSAKeys,
  generateKeyPair,
  generateRSAEncryptionKeys,
} from '@tundralibs/crypt/generators';

// Same as generateRSAKeyPair({ algorithm: 'RSA-OAEP', keySize: 2048, hashAlgorithm: 'SHA-256', format: 'PEM' })
const encKeys = await generateRSAEncryptionKeys(2048, 'PEM');

// ES256-ready EC keys, JWK-exported
const signingKeys = await generateECDSAKeys('P-256', 'JWK');

// Fully generic — algorithm decides the sensible default (P-256, or 2048-bit RSA)
const keys = await generateKeyPair('ECDSA', 'PEM');
```

### Random Secrets

#### `secretGenerator()`

Generates a cryptographically secure random secret.

```typescript ignore
const secretGenerator: (
  byteLengthOrOptions: number | SecretGeneratorOptions,
  encoding?: 'HEX' | 'BASE64' | 'BASE32' | 'ALPHANUMERIC',
) => string;
```

**Example:**

```typescript
import { secretGenerator } from '@tundralibs/crypt/generators';

const secret = secretGenerator(32, 'HEX'); // 64 hex characters
const b64Secret = secretGenerator(32, 'BASE64');
const b32Secret = secretGenerator(20, 'BASE32');
const alphaSecret = secretGenerator(16, 'ALPHANUMERIC');
```

#### Convenience Functions

```typescript ignore
const generateHexSecret: (byteLength: number) => string;
const generateBase64Secret: (byteLength: number) => string;
const generateBase32Secret: (byteLength: number) => string;
const generateAlphanumericSecret: (byteLength: number) => string;
const generateToken: () => string; // 32-byte HEX token
function generatePassword(length?: number, options?: PasswordOptions): string;
```

**Example:**

```typescript
import {
  generateAlphanumericSecret,
  generateHexSecret,
  generatePassword,
  generateToken,
} from '@tundralibs/crypt/generators';

const apiKey = generateHexSecret(32); // 64 hex chars
const token = generateToken(); // 64 hex chars (32 bytes)
const code = generateAlphanumericSecret(16);
const password = generatePassword(16, {
  uppercase: true,
  numbers: true,
  symbols: true,
});
```

### Random Numbers

#### `randomInt()` / `randomFloat()` / `randomNumber()`

Cryptographically secure alternatives to `Math.random()` for numeric ranges —
dice rolls, lottery draws, shuffling, sampling — anywhere the output must not
be predictable. Both integer functions use rejection sampling (drawing extra
random bytes and discarding out-of-range draws) so every value in the range is
equally likely; a naive `byte % range` would bias low values whenever `range`
does not evenly divide 256.

```typescript ignore
function randomInt(min: number, max: number): number; // inclusive both ends
function randomFloat(min: number, max: number, precision?: number): number; // max exclusive
function randomNumber(options?: RandomNumberOptions): number;

interface RandomNumberOptions {
  min?: number; // default 0
  max?: number; // default 100
  float?: boolean; // default false
  precision?: number; // default 16 (float mode only)
}
```

> Reach for `Math.random()` instead when the output does not need to resist
> prediction (a UI animation delay, a non-security sample). `randomInt`'s
> rejection sampling costs extra `crypto.getRandomValues()` calls compared to
> `Math.random()`, which is the right trade for anything security- or
> fairness-sensitive but unnecessary overhead otherwise.

**Example:**

```typescript
import {
  randomFloat,
  randomInt,
  randomNumber,
} from '@tundralibs/crypt/generators';

const dice = randomInt(1, 6); // 1-6 inclusive
const probability = randomFloat(0, 1); // 0.0 to 0.999...
const inRange = randomNumber({ min: 10, max: 20 }); // integer, 10-20 inclusive
const preciseFloat = randomNumber({
  min: 0,
  max: 1,
  float: true,
  precision: 4,
});
```

### BIP39 Mnemonics

#### `generateBIP39Mnemonic()`

Generates a BIP39 mnemonic phrase asynchronously.

```typescript ignore
const generateBIP39Mnemonic: (
  options?: BIP39Options,
) => Promise<BIP39Result>; // { words, phrase, entropy, seed }

interface BIP39Options {
  wordCount?: 12 | 15 | 18 | 21 | 24; // default 12
  wordlist?: readonly string[]; // default: the built-in English list; must have exactly 2048 entries
  passphrase?: string; // default ''; folded into `seed` only — see below
}
```

> `passphrase` never appears in `phrase` or `words` — it only changes the
> derived `seed`. It cannot be recovered from the phrase, and a different
> passphrase over the same phrase silently derives a different, equally
> valid-looking seed. Losing the passphrase is as unrecoverable as losing the
> phrase itself.

Aliases: `generate12WordSeed(passphrase?)`, `generate24WordSeed(passphrase?)`,
`generateSeedPhrase(wordCount?, passphrase?)` — positional shorthands fixed to
the built-in English wordlist; call `generateBIP39Mnemonic` directly to supply
another language or a custom `wordlist`.

**Example:**

```typescript
import { generateBIP39Mnemonic } from '@tundralibs/crypt/generators';

const { phrase } = await generateBIP39Mnemonic({ wordCount: 12 });
console.log(phrase); // 'abandon ability able about...'
```

#### `mnemonicToSeed()`

Converts mnemonic to seed for key derivation.

```typescript ignore
async function mnemonicToSeed(
  mnemonic: string,
  passphrase?: string,
): Promise<Uint8Array>;
```

**Example:**

```typescript
import { mnemonicToSeed } from '@tundralibs/crypt/generators';

declare const mnemonic: string;

const seed = await mnemonicToSeed(mnemonic, 'optional passphrase');
```

#### `validateBIP39Mnemonic()`

Validates a BIP39 mnemonic phrase (async). The mnemonic and the wordlist are
compared in `NFKD` form — matching `mnemonicToSeed` — so an IME-composed
(NFC/NFD) mnemonic still validates against an official NFKD wordlist.

```typescript ignore
const validateBIP39Mnemonic: (
  mnemonic: string,
  wordlist?: string[],
) => Promise<boolean>;

// Alias:
const validateSeedPhrase = validateBIP39Mnemonic;
```

**Example:**

```typescript
import { validateBIP39Mnemonic } from '@tundralibs/crypt/generators';

const isValid = await validateBIP39Mnemonic('abandon ability able...');
```

### Key Derivation

#### `derivePBKDF2Key()`

Derives a non-extractable AES `CryptoKey` from a secret + salt using
PBKDF2-SHA-256 at `PBKDF2_ITERATIONS` (210,000) — the same derivation
`encryptAES` / `decryptAES` run per message. The key is bound to a single AES
algorithm + length, ready for `crypto.subtle.encrypt` / `decrypt`.

```typescript ignore
derivePBKDF2Key(
  secret: string,
  salt: Uint8Array,
  algorithm: 'AES-GCM' | 'AES-CBC' | 'AES-CTR',
  keyLengthBits: 128 | 192 | 256,
): Promise<CryptoKey>
```

**Example:**

```typescript
import { derivePBKDF2Key } from '@tundralibs/crypt/generators';

// A fixed salt makes derivation deterministic — store it with the secret.
const salt = new Uint8Array(16).fill(7);
const key = await derivePBKDF2Key('mySecret', salt, 'AES-GCM', 256);
// Reuse `key` across many crypto.subtle.encrypt/decrypt calls.
```

#### `hkdf()`

Derive independent sub-keys from a single high-entropy secret using HKDF
(RFC 5869). Unlike PBKDF2 — a deliberately slow password stretcher — HKDF
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
  low-entropy passwords — use `pbkdf2Hash` from
  [Digest](../digest/Crypt-Digest.md) for those.
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
import { hkdf } from '@tundralibs/crypt/generators';

declare const secret: Uint8Array;

// Two independent keys from one secret — signing vs MAC.
const signKey = await hkdf(secret, { info: 'jwt' });
const macKey = await hkdf(secret, { info: 'hmac' });
// signKey and macKey are unrelated; neither leaks `secret`.
```

## Examples

### Generate RSA Keys for Encryption

```typescript
import { generateRSAKeyPair } from '@tundralibs/crypt/generators';
import { decryptRSA, encryptRSA } from '@tundralibs/crypt/encrypt';

// Generate key pair — `format: 'PEM'` fills in the exported PEM strings
const { publicKeyExported, privateKeyExported } = await generateRSAKeyPair({
  algorithm: 'RSA-OAEP',
  keySize: 2048,
  hashAlgorithm: 'SHA-256',
  format: 'PEM',
});

// Use for encryption — encryptRSA/decryptRSA take the PEM strings
const encrypted = await encryptRSA('secret', publicKeyExported as string);
const decrypted = await decryptRSA(encrypted, privateKeyExported as string);
```

### Generate API Keys

```typescript
import { generateHexSecret, generateToken } from '@tundralibs/crypt/generators';

// Generate API key
const apiKey = generateHexSecret(32); // 64 hex chars

// Generate single-use token
const token = generateToken(); // 64 hex chars
```

### BIP39 Wallet Setup

```typescript
import {
  generateBIP39Mnemonic,
  mnemonicToSeed,
  validateBIP39Mnemonic,
} from '@tundralibs/crypt/generators';

// 1. Generate mnemonic (async)
const { phrase } = await generateBIP39Mnemonic({ wordCount: 24 });
console.log('Save this safely:', phrase);

// 2. Validate mnemonic (async)
const isValid = await validateBIP39Mnemonic(phrase);

// 3. Derive seed for key generation
if (isValid) {
  const seed = await mnemonicToSeed(phrase, 'optional passphrase');
  // Use seed for HD wallet key derivation
}
```

### Generate Strong Passwords

```typescript
import { generatePassword } from '@tundralibs/crypt/generators';

// Default: 16 chars with mixed case, numbers, symbols
const password = generatePassword();

// Custom length and character sets
const customPassword = generatePassword(20, {
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: false, // No symbols
});
```

## Security Notes

- All random generation uses `crypto.getRandomValues()`
- RSA: Use minimum 2048-bit keys
- EC: P-256 curve is recommended minimum
- BIP39: Store mnemonics securely offline
- Secrets: Use sufficient entropy (32+ bytes)
- Never commit secrets to version control
- Use hardware security modules (HSM) for production keys

---

[← Back to Crypt](../README.md)
