# Crypt Module

A comprehensive cryptographic library for Deno/TypeScript that provides secure
encryption, hashing, JWT handling, and cryptographic key/secret generation
capabilities.

## Features

- 🔐 **Encryption**: AES encryption with multiple modes (GCM, CBC, CTR)
- 🔑 **Key Generation**: RSA, ECDSA, and ECDH key pair generation
- 🎲 **Secret Generation**: Cryptographically secure random secrets
- 🌱 **BIP39 Mnemonics**: Standard seed phrase generation and validation
- 🔒 **JWT**: Complete JSON Web Token implementation
- 🏗️ **Hashing**: SHA-1, SHA-2 family digest functions
- 📦 **Zero Dependencies**: Uses native Web Crypto API

## Quick Start

```typescript
import {
  createJWT,
  encryptAES,
  generateBIP39Mnemonic,
  generateHexSecret,
  generateRSAKeyPair,
} from './mod.ts';

// Generate a BIP39 mnemonic seed phrase
const mnemonic = await generateBIP39Mnemonic({ wordCount: 12 });
console.log(mnemonic.phrase);
// Output: "abandon ability able about above absent absorb abstract absurd abuse access accident"

// Generate RSA key pair
const keyPair = await generateRSAKeyPair({ format: 'PEM' });

// Generate secure random secret
const secret = generateHexSecret(32); // 32-byte hex string

// Encrypt data with AES
const plaintext = 'Secret message';
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);
const encrypted = await encryptAES(plaintext, key, 'GCM');
```

## Module Structure

```
crypt/
├── mod.ts                 # Main module exports
├── README.md             # This file
├── generators/           # Cryptographic generators
│   ├── mod.ts           # Generator exports
│   ├── secret.ts        # Secret/token generation
│   ├── key.ts           # Key pair generation
│   ├── bip39.ts         # BIP39 mnemonic generation
│   └── *.test.ts        # Test files
├── crypt/               # Encryption/decryption
│   ├── mod.ts
│   └── aes.ts
├── hash/                # Hashing/digest functions
│   ├── mod.ts
│   └── sha.ts
└── jwt/                 # JSON Web Token
    ├── mod.ts
    ├── create.ts
    ├── verify.ts
    └── types.ts
```

## API Reference

### Generators

#### Secret Generation

```typescript
import {
  generateHexSecret,
  generatePassword,
  generateToken,
} from './generators/mod.ts';

// Generate hex-encoded secret
const hexSecret = generateHexSecret(32); // 64-character hex string

// Generate URL-safe token
const token = generateToken(32); // Base64URL token

// Generate alphanumeric password
const password = generatePassword(16); // 16-character password
```

#### Key Pair Generation

```typescript
import { generateECKeyPair, generateRSAKeyPair } from './generators/mod.ts';

// RSA key pairs
const rsaKeys = await generateRSAKeyPair({
  modulusLength: 2048,
  format: 'PEM',
});

// ECDSA key pairs
const ecKeys = await generateECKeyPair({
  namedCurve: 'P-256',
  format: 'JWK',
});
```

#### BIP39 Mnemonics

```typescript
import {
  generate12WordSeed,
  generate24WordSeed,
  generateBIP39Mnemonic,
  validateBIP39Mnemonic,
} from './generators/mod.ts';

// Generate standard 12-word mnemonic
const mnemonic12 = await generate12WordSeed();

// Generate 24-word mnemonic with passphrase
const mnemonic24 = await generate24WordSeed('my passphrase');

// Custom configuration
const custom = await generateBIP39Mnemonic({
  wordCount: 15,
  passphrase: 'secure passphrase',
  wordlist: customWordList, // Optional custom 2048-word list
});

// Validate existing mnemonic
const isValid = await validateBIP39Mnemonic('abandon ability able...');
```

### Encryption

```typescript
import { decryptAES, encryptAES } from './crypt/mod.ts';

// Generate AES key
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);

// Encrypt with AES-GCM (default)
const encrypted = await encryptAES('secret data', key);

// Encrypt with AES-CTR
const encryptedCTR = await encryptAES('secret data', key, 'CTR');

// Decrypt
const decrypted = await decryptAES(encrypted, key);
```

### Hashing

```typescript
import { sha1, sha256, sha512 } from './hash/mod.ts';

const data = 'Hello, World!';

const hash256 = await sha256(data);
const hash512 = await sha512(data);
const hash1 = await sha1(data);
```

### JWT

```typescript
import { createJWT, verifyJWT } from './jwt/mod.ts';

// Create JWT
const payload = { userId: 123, role: 'admin' };
const secret = 'your-secret-key';
const token = await createJWT(payload, secret, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

// Verify JWT
const verified = await verifyJWT(token, secret);
if (verified.valid) {
  console.log('Payload:', verified.payload);
}
```

## Security Features

### Cryptographically Secure Random Generation

All generators use `crypto.getRandomValues()` for cryptographically secure
randomness.

### Standard Compliance

- **BIP39**: Full BIP39 specification compliance for mnemonic generation
- **JWT**: RFC 7519 compliant JSON Web Tokens
- **AES**: NIST-approved encryption algorithms
- **SHA**: FIPS-approved hash functions

### Key Lengths and Algorithms

- **AES**: 128, 192, and 256-bit keys
- **RSA**: 1024, 2048, 3072, 4096-bit keys
- **EC**: P-256, P-384, P-521 curves
- **HMAC**: SHA-256, SHA-384, SHA-512

## Examples

### Complete Workflow Example

```typescript
import {
  createJWT,
  encryptAES,
  generateBIP39Mnemonic,
  generateRSAKeyPair,
  sha256,
} from './mod.ts';

async function cryptoWorkflow() {
  // 1. Generate seed phrase for key derivation
  const mnemonic = await generateBIP39Mnemonic({
    wordCount: 24,
    passphrase: 'additional-security',
  });

  console.log('Seed phrase:', mnemonic.phrase);
  console.log(
    'Derived seed:',
    Array.from(mnemonic.seed).map((b) => b.toString(16).padStart(2, '0')).join(
      '',
    ),
  );

  // 2. Generate RSA key pair for signatures
  const keyPair = await generateRSAKeyPair({
    modulusLength: 2048,
    format: 'PEM',
  });

  // 3. Create encrypted data
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const sensitiveData = 'Top secret information';
  const encrypted = await encryptAES(sensitiveData, aesKey);

  // 4. Create JWT for authentication
  const jwtPayload = {
    sub: '1234567890',
    name: 'John Doe',
    iat: Math.floor(Date.now() / 1000),
  };

  const jwtSecret = 'your-jwt-secret';
  const token = await createJWT(jwtPayload, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '24h',
  });

  // 5. Hash data for integrity verification
  const dataHash = await sha256(sensitiveData);

  console.log('Workflow completed successfully!');
  return {
    mnemonic: mnemonic.phrase,
    publicKey: keyPair.publicKey,
    encryptedData: encrypted,
    authToken: token,
    dataHash,
  };
}
```

## Testing

Each module includes comprehensive test files:

```bash
# Test all generators
deno test generators/

# Test specific functionality
deno run generators/bip39.test.ts
deno run generators/secret.test.ts
deno run generators/key.test.ts
```

## Best Practices

1. **Key Management**: Always use proper key derivation and storage
2. **Randomness**: Never use Math.random() for cryptographic purposes
3. **Algorithms**: Prefer modern algorithms (AES-GCM, SHA-256+, P-256+)
4. **Validation**: Always validate inputs and handle errors appropriately
5. **Secrets**: Use secure methods to store and transmit sensitive data

## License

MIT License - see the main project LICENSE file for details.
