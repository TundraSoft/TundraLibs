# Crypt Module

A comprehensive, zero-dependency cryptographic library for Deno/TypeScript that provides secure encryption, hashing, JWT handling, one-time passwords, and cryptographic key/secret generation using the native Web Crypto API.

**Features:**
- 🔐 AES encryption with multiple modes (GCM, CBC, CTR)
- 🏗️ SHA-1, SHA-2 family digest functions
- 🔑 RSA, ECDSA, and ECDH key pair generation
- 🎲 Cryptographically secure random secrets
- 🌱 BIP39 mnemonic seed phrase generation
- 🔒 JSON Web Tokens with HMAC and RSA algorithms
- 🔢 TOTP and HOTP one-time password generation
- ✅ High test coverage (93.3% branch, 100% on core modules)

## Index

- [Quickstart](#quickstart)
- [Digest (Hashing)](#digest)
- [Encrypt (AES)](#encrypt)
- [Generators](#generators)
  - [Secrets](#secrets)
  - [Key Pairs](#key-pairs)
  - [BIP39 Mnemonics](#bip39)
- [JWT (JSON Web Tokens)](#jwt)
- [OTP (One-Time Passwords)](#otp)
- [Testing & Coverage](#testing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Quickstart

```typescript
// Import everything from the main module
import * as crypt from './mod.ts';

// Or import specific functions
import {
  // Digest
  sha256,
  sha512,
  // Encryption
  encryptAES,
  decryptAES,
  // Generators
  generateHexSecret,
  generateRSAKeyPair,
  generateBIP39Mnemonic,
  // JWT
  issueJWT,
  verifyJWT,
  refreshJWT,
  // OTP
  generateTOTP,
  verifyTOTP,
} from './mod.ts';

// Example 1: Secure user authentication with JWT and OTP
async function secureAuth() {
  // Generate TOTP secret for 2FA
  const secret = generateHexSecret(20);
  const totp = await generateTOTP(secret);

  // Create JWT after authentication
  const token = await issueJWT({ userId: 123, role: 'admin' }, 'jwt-secret', {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

  return { token, totp, secret };
}

// Example 2: Encrypt sensitive data with AES
async function encryptUserData(data: string) {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const encrypted = await encryptAES(data, key);
  const hash = await sha256(data); // Integrity check

  return { encrypted, hash };
}
```

---

## Digest

---

## Digest

Cryptographic hash functions for data integrity and fingerprinting.

### Quickstart

```typescript
import { sha1, sha256, sha384, sha512 } from './hash/mod.ts';

const data = 'Hello, World!';
const hash = await sha256(data);
console.log(hash); // Hex-encoded SHA-256 hash
```

### API Reference

#### `sha1(data: string | ArrayBuffer | Uint8Array): Promise<string>`

Compute SHA-1 digest (160-bit). **Not recommended for security-critical applications.**

#### `sha256(data: string | ArrayBuffer | Uint8Array): Promise<string>`

Compute SHA-256 digest (256-bit). Industry standard for integrity checks.

#### `sha384(data: string | ArrayBuffer | Uint8Array): Promise<string>`

Compute SHA-384 digest (384-bit). Part of SHA-2 family.

#### `sha512(data: string | ArrayBuffer | Uint8Array): Promise<string>`

Compute SHA-512 digest (512-bit). Highest security in SHA-2 family.

### Examples

```typescript
// Hash a string
const passwordHash = await sha256('user-password-123');

// Hash binary data
const fileData = await Deno.readFile('document.pdf');
const fileHash = await sha512(fileData);

// Hash for data integrity
const originalData = 'sensitive information';
const checksum = await sha256(originalData);
// Later: verify data hasn't changed
const newChecksum = await sha256(receivedData);
if (checksum === newChecksum) {
  console.log('Data integrity verified');
}
```

### Caveats

- **SHA-1** is cryptographically broken and should only be used for non-security purposes (e.g., Git commits)
- All functions return **hex-encoded** strings, not raw bytes
- For password hashing, use specialized algorithms like bcrypt or Argon2, not raw SHA functions

---

## Encrypt

AES encryption for confidential data protection.

### Quickstart

```typescript
import { encryptAES, decryptAES } from './crypt/mod.ts';

// Generate key
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);

// Encrypt
const encrypted = await encryptAES('secret message', key);

// Decrypt
const decrypted = await decryptAES(encrypted, key);
```

### API Reference

#### `encryptAES(data: string, key: CryptoKey, mode?: 'GCM' | 'CBC' | 'CTR'): Promise<string>`

Encrypt data with AES. Returns base64-encoded ciphertext with embedded IV.

- **data**: Plaintext string to encrypt
- **key**: CryptoKey from `crypto.subtle.generateKey()`
- **mode**: Encryption mode (default: 'GCM')

#### `decryptAES(encrypted: string, key: CryptoKey, mode?: 'GCM' | 'CBC' | 'CTR'): Promise<string>`

Decrypt AES-encrypted data. Returns original plaintext.

- **encrypted**: Base64-encoded ciphertext from `encryptAES()`
- **key**: Same CryptoKey used for encryption
- **mode**: Must match encryption mode

### Examples

```typescript
// Encrypt user data with AES-GCM (authenticated encryption)
const userKey = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  true, // extractable
  ['encrypt', 'decrypt'],
);

const userData = JSON.stringify({ ssn: '123-45-6789', dob: '1990-01-01' });
const encrypted = await encryptAES(userData, userKey, 'GCM');

// Store encrypted data safely
await Deno.writeTextFile('user_data.enc', encrypted);

// Later: decrypt and parse
const retrieved = await Deno.readTextFile('user_data.enc');
const decrypted = await decryptAES(retrieved, userKey, 'GCM');
const parsed = JSON.parse(decrypted);
```

### Caveats

- **Key management is critical**: Losing the key means losing access to data
- **AES-GCM** is recommended over CBC/CTR (provides authentication)
- **IV is embedded** in the ciphertext automatically
- Keys must have correct usage flags: `['encrypt', 'decrypt']`
- Use 256-bit keys for maximum security

---

## Generators

### Secrets

Generate cryptographically secure random secrets.

#### Quickstart

```typescript
import { generateHexSecret, generateBase32Secret } from './generators/mod.ts';

const apiKey = generateHexSecret(32); // 64-char hex string
const totpSecret = generateBase32Secret(20); // Base32 for OTP apps
```

#### API Reference

##### `generateHexSecret(byteLength: number): string`

Generate hex-encoded secret. Each byte produces 2 hex characters.

##### `generateBase64Secret(byteLength: number): string`

Generate base64-encoded secret. Compact representation.

##### `generateBase32Secret(byteLength: number): string`

Generate base32-encoded secret. Ideal for TOTP/HOTP (Google Authenticator compatible).

##### `generateAlphanumericSecret(length: number): string`

Generate alphanumeric secret (A-Z, a-z, 0-9). Human-friendly.

##### `secretGenerator(options): string`

Advanced secret generation with custom encoding.

```typescript
const secret = secretGenerator({
  byteLength: 32,
  encoding: 'HEX' | 'BASE32' | 'BASE64' | 'ALPHANUMERIC',
});
```

#### Examples

```typescript
// API key generation
const apiKey = generateHexSecret(32); // 256-bit security

// TOTP secret for 2FA
const totpSecret = generateBase32Secret(20);
// Use with authenticator apps

// Session token
const sessionToken = generateBase64Secret(24); // Compact URL-safe

// Recovery code (human-readable)
const recoveryCode = generateAlphanumericSecret(12).match(/.{1,4}/g)?.join('-');
// Output: "aB3d-Ef9h-Jk2m"
```

#### Caveats

- All secrets use `crypto.getRandomValues()` (cryptographically secure)
- **Byte length** determines security: 16 bytes = 128-bit, 32 bytes = 256-bit
- Base32 secrets may have padding (`=`) - safe to remove for TOTP
- Never use `Math.random()` for secrets

---

### Key Pairs

Generate RSA, ECDSA, and ECDH key pairs.

#### Quickstart

```typescript
import { generateRSAKeyPair, generateECKeyPair } from './generators/mod.ts';

// RSA keys for signatures/encryption
const rsa = await generateRSAKeyPair({ format: 'PEM' });

// Elliptic curve keys (faster, smaller)
const ec = await generateECKeyPair({ namedCurve: 'P-256', format: 'JWK' });
```

#### API Reference

##### `generateRSAKeyPair(options): Promise<KeyPair>`

Generate RSA key pair.

**Options:**
- `modulusLength`: 1024, 2048, 3072, 4096 (default: 2048)
- `format`: 'PEM' | 'JWK' | 'raw' (default: 'JWK')
- `publicExponent`: Uint8Array (default: 65537)

##### `generateECKeyPair(options): Promise<KeyPair>`

Generate Elliptic Curve key pair (ECDSA or ECDH).

**Options:**
- `namedCurve`: 'P-256' | 'P-384' | 'P-521' (default: 'P-256')
- `format`: 'PEM' | 'JWK' | 'raw' (default: 'JWK')
- `algorithm`: 'ECDSA' | 'ECDH' (default: 'ECDSA')

#### Examples

```typescript
// Generate 4096-bit RSA keys for high security
const rsaKeys = await generateRSAKeyPair({
  modulusLength: 4096,
  format: 'PEM',
});
console.log(rsaKeys.publicKey); // PEM format string
console.log(rsaKeys.privateKey); // PEM format string

// Generate P-521 EC keys (highest EC security)
const ecKeys = await generateECKeyPair({
  namedCurve: 'P-521',
  format: 'JWK',
});

// Use for JWT RSA signatures
const jwtKeys = await generateRSAKeyPair({
  modulusLength: 2048,
  format: 'raw', // Returns CryptoKey objects
});
// Use directly with issueJWT/verifyJWT
```

#### Caveats

- **RSA 2048-bit** is current standard; 4096-bit for long-term security
- **P-256** is fastest EC curve; P-521 for maximum security
- PEM format is text-based; JWK is JSON; raw returns CryptoKey objects
- EC keys are smaller and faster than RSA for equivalent security

---

### BIP39

Generate and validate BIP39 mnemonic seed phrases.

#### Quickstart

```typescript
import {
  generateBIP39Mnemonic,
  generate12WordSeed,
  validateBIP39Mnemonic,
} from './generators/mod.ts';

// Quick 12-word seed
const seed = await generate12WordSeed();
console.log(seed.phrase);

// Validate existing mnemonic
const isValid = await validateBIP39Mnemonic(
  'abandon ability able about above absent absorb abstract absurd abuse access accident',
);
```

#### API Reference

##### `generateBIP39Mnemonic(options): Promise<BIP39Result>`

Generate BIP39 mnemonic with custom options.

**Options:**
- `wordCount`: 12, 15, 18, 21, 24 (default: 12)
- `passphrase`: Optional additional passphrase (default: '')
- `wordlist`: Optional custom 2048-word array

**Returns:** `{ phrase: string, seed: Uint8Array }`

##### `generate12WordSeed(passphrase?: string): Promise<BIP39Result>`

Shortcut for 12-word mnemonic.

##### `generate24WordSeed(passphrase?: string): Promise<BIP39Result>`

Shortcut for 24-word mnemonic.

##### `validateBIP39Mnemonic(phrase: string, wordlist?: string[]): Promise<boolean>`

Validate BIP39 mnemonic phrase.

#### Examples

```typescript
// Generate 24-word seed with passphrase
const secureSeed = await generateBIP39Mnemonic({
  wordCount: 24,
  passphrase: 'my secure passphrase',
});

// Derive seed bytes for key derivation
const keyMaterial = secureSeed.seed; // Use with HKDF, PBKDF2, etc.

// Validate user-entered recovery phrase
async function validateRecoveryPhrase(userInput: string) {
  const isValid = await validateBIP39Mnemonic(userInput);
  if (!isValid) {
    throw new Error('Invalid recovery phrase');
  }
  return true;
}
```

#### Caveats

- **12 words** = 128-bit entropy; **24 words** = 256-bit entropy
- Passphrases add security but if forgotten, seed is unrecoverable
- BIP39 uses checksums - validation catches typos
- Standard English wordlist is included; custom wordlists must be exactly 2048 words
- Seed bytes (512-bit) are derived using PBKDF2-HMAC-SHA512

---

## JWT

JSON Web Tokens with HMAC and RSA algorithms.

### Quickstart

```typescript
import { issueJWT, verifyJWT } from './JWT/mod.ts';

// Create token
const token = await issueJWT({ userId: 123 }, 'secret', {
  algorithm: 'HS256',
  expiresIn: '1h',
});

// Verify token
const result = await verifyJWT(token, 'secret');
if (result.valid) {
  console.log(result.payload);
}
```

### API Reference

#### `issueJWT(payload, key, options): Promise<string>`

#### `issueJWT(payload, key, options): Promise<string>`

Create signed JWT token.

**Parameters:**
- `payload`: Object with claims (avoid sensitive data)
- `key`: String (HMAC) or CryptoKey (RSA private key)
- `options`:
  - `algorithm`: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512'
  - `expiresIn`: Duration string ('1h', '30m', '7d') or seconds
  - `notBefore`: When token becomes valid (default: '0s')
  - `issuer`: Token issuer (iss claim)
  - `audience`: Token audience (aud claim) - string or array
  - `subject`: Token subject (sub claim)
  - `jwtId`: Unique token ID (jti claim)

#### `verifyJWT(token, key, options): Promise<VerifyResult>`

Verify and decode JWT token.

**Parameters:**
- `token`: JWT string to verify
- `key`: String (HMAC) or CryptoKey (RSA public key)
- `options`:
  - `issuer`: Expected issuer to validate
  - `audience`: Expected audience to validate
  - `subject`: Expected subject to validate
  - `clockTolerance`: Allow clock skew in seconds (default: 0)

**Returns:** `{ valid: boolean, payload?: object, error?: string }`

#### `refreshJWT(token, key, expiresIn?): Promise<string>`

Refresh token with updated timestamps.

**Parameters:**
- `token`: Existing valid JWT
- `key`: String (HMAC) or `RefreshKeyConfig` (RSA: `{ verifyKey, signKey }`)
- `expiresIn`: Optional new expiration (uses original if omitted)

#### `decodeJWT(token): DecodedJWT`

Decode JWT without verification (inspect only).

**Returns:** `{ header: object, payload: object, signature: string }`

### Examples

```typescript
// HMAC JWT (symmetric key)
const token = await issueJWT(
  { userId: 123, role: 'admin' },
  'my-secret-key',
  {
    algorithm: 'HS256',
    expiresIn: '1h',
    issuer: 'myapp',
    audience: 'api',
  },
);

// Verify with expected claims
const result = await verifyJWT(token, 'my-secret-key', {
  issuer: 'myapp',
  audience: 'api',
});

// RSA JWT (asymmetric keys)
const keyPair = await crypto.subtle.generateKey(
  {
    name: 'RSA-PSS',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);

const rsaToken = await issueJWT({ userId: 456 }, keyPair.privateKey, {
  algorithm: 'RS256',
  expiresIn: '24h',
});

const rsaResult = await verifyJWT(rsaToken, keyPair.publicKey);

// Refresh token (HMAC)
const refreshed = await refreshJWT(token, 'my-secret-key');
// New exp, iat - same payload

// Refresh with custom expiry
const customRefresh = await refreshJWT(token, 'my-secret-key', '2h');

// Refresh RSA token (requires both keys)
import type { RefreshKeyConfig } from './JWT/mod.ts';
const rsaConfig: RefreshKeyConfig = {
  verifyKey: keyPair.publicKey,  // Verify old token
  signKey: keyPair.privateKey,   // Sign new token
};
const refreshedRSA = await refreshJWT(rsaToken, rsaConfig, '24h');

// Decode without verification (debugging)
const decoded = decodeJWT(token);
console.log('Algorithm:', decoded.header.alg);
console.log('Expires:', new Date(decoded.payload.exp * 1000));
```

### Performance

Based on benchmarks with 2048-bit RSA keys:

| Operation | HMAC (HS256) | RSA (RS256) |
|-----------|--------------|-------------|
| Issue | ~51 µs | ~1.5 ms |
| Verify | ~48 µs | ~270 µs |
| Decode | ~7 µs | ~7 µs |
| Refresh | ~113 µs | ~1.8 ms |
| Round-trip | ~99 µs | ~1.7 ms |

**Recommendation:** HMAC for internal services; RSA when public key distribution is needed.

### Caveats

- **HMAC** requires shared secret - secure distribution critical
- **RSA** requires proper key pair management - never expose private key
- Token size: HMAC ~150 bytes, RSA ~350 bytes (larger signatures)
- `refreshJWT` preserves all original claims except exp, iat, nbf
- For RSA refresh, must provide `RefreshKeyConfig` with separate verify/sign keys
- `decodeJWT` does **not** verify signatures - only use for inspection
- Always validate critical claims (iss, aud, sub) in production
- Use clock tolerance for distributed systems with time skew

---

## OTP

Time-based (TOTP) and Counter-based (HOTP) one-time passwords.

### Quickstart

```typescript
import { generateTOTP, verifyTOTP } from './OTP/mod.ts';

// Generate TOTP code
const secret = 'JBSWY3DPEHPK3PXP'; // Base32-encoded
const code = await generateTOTP(secret);

// Verify TOTP code
const isValid = await verifyTOTP(code, secret);
```

### API Reference

#### `generateTOTP(key, options): Promise<string>`

Generate Time-based OTP.

**Parameters:**
- `key`: Secret key (minimum 16 characters)
- `options`:
  - `epoch`: Time in milliseconds (default: `Date.now()`)
  - `period`: Time step in seconds (default: 30)
  - `length`: OTP digit length (default: 6)
  - `algo`: 'SHA-1' | 'SHA-256' | 'SHA-512' (default: 'SHA-256')

#### `verifyTOTP(otp, key, options): Promise<boolean>`

Verify Time-based OTP with time window.

**Parameters:**
- `otp`: OTP code to verify
- `key`: Secret key
- `options`:
  - `window`: Time steps to check before/after (default: 1)
  - `epoch`, `period`, `length`, `algo`: Same as generateTOTP

#### `generateHOTP(key, counter, options): Promise<string>`

Generate Counter-based OTP.

**Parameters:**
- `key`: Secret key (minimum 16 characters)
- `counter`: Counter value (non-negative integer)
- `options`:
  - `length`: OTP digit length (default: 6)
  - `algo`: Hash algorithm (default: 'SHA-256')

#### `verifyHOTP(otp, key, counter, options): Promise<boolean>`

Verify Counter-based OTP.

#### `generateOTPAuthURL(options): string`

Generate `otpauth://` URL for QR codes (Google Authenticator compatible).

**Options:**
- `type`: 'totp' | 'hotp'
- `secret`: Base32-encoded secret
- `accountName`: User account identifier
- `issuer`: Service name
- `algorithm`: 'SHA-1' | 'SHA-256' | 'SHA-512' (default: 'SHA-1')
- `digits`: OTP length (default: 6)
- `period`: TOTP period (default: 30)
- `counter`: HOTP counter (required for HOTP)

### Examples

```typescript
import {
  generateBase32Secret,
  generateOTPAuthURL,
  generateTOTP,
  verifyTOTP,
} from './mod.ts';

// Complete TOTP setup flow
async function setupTwoFactor(userId: string) {
  // 1. Generate secret
  const secret = generateBase32Secret(20);

  // 2. Generate QR code URL
  const qrUrl = generateOTPAuthURL({
    type: 'totp',
    secret,
    accountName: `user-${userId}`,
    issuer: 'MyApp',
    algorithm: 'SHA-256',
    digits: 6,
    period: 30,
  });

  // 3. Display QR code to user (encode qrUrl as QR image)
  console.log('Scan this QR:', qrUrl);

  // 4. Verify user can generate codes
  const testCode = await generateTOTP(secret);
  console.log('Test code:', testCode);

  return { secret, qrUrl };
}

// Verify TOTP with 1-step window (±30s)
async function verifyUserOTP(userCode: string, userSecret: string) {
  const isValid = await verifyTOTP(userCode, userSecret, {
    window: 1, // Allow one step before/after
    period: 30,
  });
  return isValid;
}

// HOTP for one-time codes
let counter = 0;
const hotpSecret = 'JBSWY3DPEHPK3PXP';

async function generateRecoveryCode() {
  const code = await generateHOTP(hotpSecret, counter);
  counter++; // Increment for next code
  return code;
}
```

### Caveats

- **TOTP window**: `window: 1` allows ±1 time step (±30s with 30s period)
- **HOTP counter** must be synchronized between client and server
- **Secret length**: Minimum 16 characters (128-bit security)
- **Base32 encoding**: Required for authenticator apps (Google Authenticator)
- **SHA-1** is default for authenticator compatibility; use SHA-256 for new systems
- OTP codes are **not** padded with leading zeros - ensure string comparison
- Time sync is critical for TOTP - use NTP in production

---

## Testing

### Running Tests

```bash
# All tests
deno test --allow-all

# With coverage
deno test --allow-all --coverage=coverage
deno coverage coverage --lcov --output=coverage/lcov.info
deno coverage coverage --html

# Module-specific tests
deno test JWT/ --allow-all
deno test OTP/ --allow-all
deno test generators/ --allow-all
```

### Benchmarks

```bash
# JWT performance benchmarks
deno bench JWT/JWT.bench.ts --allow-all
```

### Coverage Report

Current test coverage (as of latest run):

| Module | Branch | Line |
|--------|--------|------|
| **Overall** | 93.3% | 74.7% |
| JWT/Error.ts | 100% | 100% |
| JWT/helpers.ts | 100% | 100% |
| JWT/issue.ts | 84.6% | 72.7% |
| JWT/verify.ts | 85.7% | 86.4% |
| OTP/HOTP.ts | 100% | 100% |
| OTP/TOTP.ts | 100% | 100% |

All critical paths and error conditions are tested.

---

## Roadmap

### Planned Features

- [ ] **EdDSA support** for JWT (Ed25519 signatures)
- [ ] **ECDSA JWT** algorithms (ES256, ES384, ES512)
- [ ] **Key derivation** (PBKDF2, HKDF, Scrypt, Argon2)
- [ ] **ChaCha20-Poly1305** encryption
- [ ] **X.509 certificate** parsing and validation
- [ ] **PEM/DER** format utilities
- [ ] **Encrypted JWT** (JWE) support
- [ ] **JWT key rotation** utilities
- [ ] **TOTP backup codes** generation

### Future Enhancements

- [ ] Browser/Deno dual compatibility
- [ ] Streaming encryption for large files
- [ ] Hardware security module (HSM) integration
- [ ] FIPS 140-2 compliance mode
- [ ] Zero-knowledge proof utilities

### Performance Improvements

- [ ] WebAssembly acceleration for heavy operations
- [ ] Lazy loading for large algorithm sets
- [ ] Memory-efficient streaming APIs

---

## License

MIT License - See the main project LICENSE file for details.

---

## Built with ❤️

Built with care for the Deno community. Contributions, issues, and feedback are welcome!

**Repository:** [TundraSoft/TundraLibs](https://github.com/TundraSoft/TundraLibs)  
**Module:** `crypt`  
**Maintainer:** TundraSoft  
