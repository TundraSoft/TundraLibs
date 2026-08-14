# Crypt-OTP

Time-based (TOTP) and HMAC-based (HOTP) one-time password generation.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

RFC-compliant OTP implementation for two-factor authentication.

### Features

| Feature         | Bun | Deno | Node.js |
| --------------- | --- | ---- | ------- |
| TOTP (RFC 6238) | ✅  | ✅   | ✅      |
| HOTP (RFC 4226) | ✅  | ✅   | ✅      |
| Base32 secrets  | ✅  | ✅   | ✅      |

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

### `generateTOTP()`

Generates a time-based OTP.

```typescript ignore
async function generateTOTP(
  secret: string,
  options?: TOTPOptions,
): Promise<string>;
```

**Example:**

```typescript
import { generateTOTP } from '@tundralibs/crypt/OTP';

const otp = await generateTOTP('JBSWY3DPEHPK3PXP');
console.log(otp); // '123456'
```

### `verifyTOTP()`

Verifies a time-based OTP.

```typescript ignore
async function verifyTOTP(
  otp: string,
  key: string,
  options?: TOTPOptions,
): Promise<boolean>;
```

**Parameters:**

- `otp` — The OTP code to verify (e.g. `'123456'`)
- `key` — The Base32-encoded secret key
- `options` — Optional TOTP configuration

**Example:**

```typescript
import { verifyTOTP } from '@tundralibs/crypt/OTP';

const isValid = await verifyTOTP('123456', 'JBSWY3DPEHPK3PXP');
```

### `generateHOTP()`

Generates a counter-based OTP.

```typescript ignore
async function generateHOTP(
  secret: string,
  counter: number,
  options?: HOTPOptions,
): Promise<string>;
```

**Example:**

```typescript
import { generateHOTP } from '@tundralibs/crypt/OTP';

const otp = await generateHOTP('JBSWY3DPEHPK3PXP', 0);
```

### `verifyHOTP()`

Verifies a counter-based OTP.

```typescript ignore
async function verifyHOTP(
  otp: string,
  key: string,
  counter: number,
  options?: HOTPOptions,
): Promise<boolean>;
```

**Parameters:**

- `otp` — The OTP code to verify
- `key` — The Base32-encoded secret key
- `counter` — The counter value to verify against
- `options` — Optional HOTP configuration

### `generateOTPAuthURL()`

Builds an `otpauth://` URL for authenticator apps (Google Authenticator,
Authy, …), typically rendered as a QR code.

```typescript ignore
function generateOTPAuthURL(options: OTPAuthURLOptions): string;
```

**Parameters (`options`):**

- `type` — `'totp'` or `'hotp'`
- `secret` — the OTP secret, interpreted exactly as `generateTOTP`/`verifyTOTP` interpret it. A valid upper-case Base32 string is Base32-decoded and used as the key; anything else — a raw passphrase (including an all-upper-case one that is not a valid Base32 length), or a lower-case/space-grouped string — is treated as UTF-8 bytes. The key bytes are then re-encoded to Base32 for the URL, so the URL secret is byte-identical to the input only when the input is **canonical** Base32 — a length that is a multiple of 8, or a shorter decodable length whose unused trailing bits are zero. A non-canonical secret (a valid decodable length but with non-zero trailing bits) is normalised, so its final character may change (e.g. `BASE32SECRET` → `BASE32SECREQ`). Either way the URL secret decodes to the same key the engine HMACs.
- `accountName` — usually the user's email or username
- `issuer` — your app/service name
- `algorithm?` — `'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'` (default `'SHA-1'`)
- `digits?` — 6–8 (default `6`)
- `period?` — TOTP period in seconds (default `30`)
- `counter?` — initial HOTP counter (default `0`)

**Example:**

```typescript
import { generateOTPAuthURL } from '@tundralibs/crypt/OTP';

const url = generateOTPAuthURL({
  type: 'totp',
  secret: 'JBSWY3DPEHPK3PXP',
  accountName: 'user@example.com',
  issuer: 'MyApp',
});
// otpauth://totp/MyApp:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp&algorithm=SHA1&digits=6&period=30
```

## Examples

### TOTP 2FA Setup

```typescript
import {
  generateOTPAuthURL,
  generateTOTP,
  verifyTOTP,
} from '@tundralibs/crypt/OTP';

// 1. Generate secret for user (use generateBase32Secret from @tundralibs/crypt/generators)
const secret = 'JBSWY3DPEHPK3PXP'; // Base32 secret

// 2. Build the provisioning URL and show it as a QR code
const qrUrl = generateOTPAuthURL({
  type: 'totp',
  secret,
  accountName: 'user@example.com',
  issuer: 'MyApp',
});
console.log(qrUrl); // Show as QR code to user

// 3. User scans QR code and enters OTP. Defaults line up end to end:
//    the URL advertises SHA-1/6 digits/30s and verifyTOTP assumes the same.
const userOTP = '123456';
const isValid = await verifyTOTP(userOTP, secret);

if (isValid) {
  console.log('2FA enabled successfully');
}
```

### TOTP Verification with Window

```typescript
import { verifyTOTP } from '@tundralibs/crypt/OTP';

declare const userOTP: string;

// Allow ±1 time window (90 seconds total)
const isValid = await verifyTOTP(
  userOTP,
  'JBSWY3DPEHPK3PXP',
  { window: 1 },
);
```

### HOTP for Backup Codes

```typescript
import { generateHOTP } from '@tundralibs/crypt/OTP';

// Generate 10 backup codes
const secret = 'JBSWY3DPEHPK3PXP';
const backupCodes = [];

for (let i = 0; i < 10; i++) {
  const code = await generateHOTP(secret, i, { length: 8 });
  backupCodes.push(code);
}

console.log(backupCodes);
```

## Security Notes

- Store secrets securely (encrypted in database)
- Use TOTP for most 2FA implementations
- Default 30-second window is recommended
- Implement rate limiting on verification
- Generate secrets with sufficient entropy (20+ bytes)
- Use HTTPS for all OTP operations

### Why SHA-1 is the default

Every OTP function here (generate, verify, and `generateOTPAuthURL`) defaults
to **SHA-1** — the RFC 4226/6238 interop default. Mainstream authenticator
apps compute SHA-1 regardless of what the provisioning URL says, so a
different default would break login for users provisioned with default
settings. This is HMAC-SHA-1, which is not affected by SHA-1's collision
weakness. Pass `algo`/`algorithm` explicitly on **both** the provisioning URL
and the verify call if you need a stronger digest and control the client.

---

[← Back to Crypt](../README.md)
