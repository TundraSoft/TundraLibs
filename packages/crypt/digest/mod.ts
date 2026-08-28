/**
 * @fileoverview Digest module exports.
 *
 * Re-exports cryptographic hashing functions and types, plus salted PBKDF2
 * password hashing/verification for at-rest storage.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { pbkdf2Hash, sha256, sha512 } from '@tundralibs/crypt/digest';
 *
 * const hash = await sha256('data');
 * const stored = await pbkdf2Hash('correct horse battery staple');
 * ```
 */

export { digest, sha1, sha256, sha384, sha512 } from './digest.ts';
export { DIGEST_OUTPUT_BYTES, validateDigestAlgorithm } from './helper.ts';
export {
  pbkdf2,
  PBKDF2_PASSWORD_ITERATIONS,
  pbkdf2Hash,
  pbkdf2Verify,
  SALT_BYTES,
} from './pbkdf2.ts';
export type {
  DigestAlgorithms,
  DigestOptions,
  PBKDF2Hash,
} from './types/mod.ts';
