/**
 * @fileoverview Sign module exports.
 *
 * Re-exports digital signature and verification functions with types
 * for HMAC, RSA (PSS / PKCS#1 v1.5), ECDSA and Ed25519 algorithms.
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

export { ecdsaDerToRaw } from './ecdsaSignature.ts';
export { signEC, signEd25519, signHMAC, signRSA } from './sign.ts';
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
export { verifyEC, verifyEd25519, verifyHMAC, verifyRSA } from './verify.ts';
export type { DigestAlgorithms } from '../digest/mod.ts';
export { describeKey, importSigningKey } from './keys.ts';
export type { KeyFamily, KeyShape } from './keys.ts';
