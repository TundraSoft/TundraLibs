/**
 * @fileoverview OTP module exports.
 *
 * Re-exports HOTP and TOTP functions with types for one-time password
 * generation and verification.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { generateTOTP, generateHOTP } from '@tundralibs/crypt/OTP';
 *
 * const totp = await generateTOTP('secret');
 * const hotp = await generateHOTP('secret', 0);
 * ```
 */

export { generateTOTP, verifyTOTP } from './TOTP.ts';
export { generateHOTP, verifyHOTP } from './HOTP.ts';
export {
  constantTimeEqual,
  generateOTPAuthURL,
  type HOTPOptions,
  type OTPAuthURLOptions,
  type OTPType,
  type TOTPOptions,
  type TOTPVerifyOptions,
} from './common.ts';
export type { DigestAlgorithms } from '../digest/mod.ts';
