# Crypt-Generators

Cryptographic key pair generation, random secrets, and BIP39 mnemonics.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Overview

Secure generation of cryptographic keys, random secrets, and mnemonic phrases.

### Features

| Feature         | Bun | Deno | Node.js | Workers | Browser |
| --------------- | --- | ---- | ------- | ------- | ------- |
| RSA key pairs   | ✅  | ✅   | ✅      | ✅      | ✅      |
| EC key pairs    | ✅  | ✅   | ✅      | ✅      | ✅      |
| Random secrets  | ✅  | ✅   | ✅      | ✅      | ✅      |
| BIP39 mnemonics | ✅  | ✅   | ✅      | ✅      | ✅      |
| PEM/JWK export  | ✅  | ✅   | ✅      | ✅      | ✅      |

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
  keySize?: number; // defaults to 2048
  hashAlgorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512'; // defaults to 'SHA-256'
  format?: 'PEM' | 'DER' | 'JWK';
  extractable?: boolean;
}
```

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
  format?: 'PEM' | 'DER' | 'JWK';
  extractable?: boolean;
}
```

**Example:**

```typescript
import { generateECKeyPair } from '@tundralibs/crypt/generators';

const { publicKeyExported, privateKeyExported } = await generateECKeyPair({
  algorithm: 'ECDSA',
  curve: 'P-256',
  format: 'JWK',
});
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

### BIP39 Mnemonics

#### `generateBIP39Mnemonic()`

Generates a BIP39 mnemonic phrase asynchronously.

```typescript ignore
const generateBIP39Mnemonic: (
  options?: BIP39Options, // { wordCount?: 12 | 15 | 18 | 21 | 24, ... }
) => Promise<BIP39Result>; // { words, phrase, entropy, seed }
```

Aliases: `generate12WordSeed()`, `generate24WordSeed()`, `generateSeedPhrase()`

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
