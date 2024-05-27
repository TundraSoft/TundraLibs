# OTP

This module exports functionalities for generating OTPs (One Time Passwords) compliant with RFC-6238 (TOTP: Time-Based One-Time Password Algorithm) and RFC-4226 (HOTP: HMAC-Based One-Time Password Algorithm).

## Exports:

### Types:

- `OTPAlgorithm`: Algorithm type for the OTP generation. It can be any one of the following values - `'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'`.

### Functions:

- `TOTP`
- `HOTP`

## Usage:

### TOTP

Generates a time based OTP compliant with RFC-6238.

```typescript
import { TOTP } from './otp_generator.ts';

async function generateOTP() {
  let otp = await TOTP('JBSWY3DPEHPK3PXP', 'SHA-1', 6);
  console.log(otp); // Prints the generated OTP to the console
}

generateOTP();
```

#### Parameters:

- `key` (string): The secret key.
- `algo` (OTPAlgorithm): The algorithm to use. Accepted values are SHA-1 | SHA-256 | SHA-384 | SHA-512.
- `length` (number): The length of the generated OTP.
- `interval` (optional number): The time interval in seconds for which the OTP is generated. Default is 30 seconds.
- `epoc` (optional number): Unix timestamp epoc in milliseconds. Defaults to Date.now().

#### Returns:

(string): OTP with 0 padding on left.

---

### HOTP

Generates a Hash based OTP compliant with RFC-4226.

```typescript
import { HOTP } from './otp_generator.ts';

async function generateOTP() {
  let otp = await HOTP('JBSWY3DPEHPK3PXP', 'SHA-1', 6, 2);
  console.log(otp); // Prints the generated OTP to the console
}

generateOTP();
```

#### Parameters:

- `key` (string): The secret key.
- `algo` (OTPAlgorithm): The algorithm to use. Accepted values are SHA-1 | SHA-256 | SHA-384 | SHA-512.
- `length` (number): The length of the generated OTP.
- `counter` (number): The counter value. This is usually the number of times the OTP has been generated.

#### Returns:

(string): OTP with 0 padding on left.

---
