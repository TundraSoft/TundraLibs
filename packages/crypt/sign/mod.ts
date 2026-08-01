/**
 * @fileoverview Sign module exports.
 *
 * Re-exports digital signature and verification functions with types
 * for HMAC, RSA (PSS / PKCS#1 v1.5) and ECDSA algorithms.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';
 *
 * const signature = await signHMAC('data', 'secret');
 * const valid = await verifyHMAC('data', signature, 'secret');
 * ```
 */

export { signEC, signHMAC, signRSA } from './sign.ts';
export type {
  ECCurve,
  ECHashAlgorithm,
  ECOptions,
  HMACHashAlgorithm,
  HMACOptions,
  RSAHashAlgorithm,
  RSAOptions,
  SigningKey,
} from './types/mod.ts';
export { verifyEC, verifyHMAC, verifyRSA } from './verify.ts';
export type { DigestAlgorithms } from '../digest/mod.ts';
export { describeKey } from './keys.ts';
export type { KeyFamily, KeyShape } from './keys.ts';
