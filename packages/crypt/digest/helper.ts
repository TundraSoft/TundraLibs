/**
 * @fileoverview Digest helper functions.
 *
 * Digest algorithm validation and output-size metadata, shared by every
 * module that takes a {@link DigestAlgorithms} (digest, HMAC, RSA-OAEP,
 * PBKDF2, HKDF).
 *
 * @module
 */

import { DigestAlgorithms } from './types/mod.ts';

/**
 * Digest output length in **bytes**, per algorithm — the single source for
 * every size derived from a hash choice (HKDF output ceilings, PBKDF2
 * output bits, RSA-OAEP payload capacity).
 */
export const DIGEST_OUTPUT_BYTES: Record<DigestAlgorithms, number> = {
  'SHA-1': 20,
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
};

/**
 * Validates that the digest algorithm is one of the supported
 * {@link DigestAlgorithms}.
 *
 * @param {DigestAlgorithms} digest - The digest algorithm to validate ({@link DigestAlgorithms})
 * @throws {Error} When the digest algorithm is not supported
 *
 * @example
 * ```typescript
 * import type { DigestAlgorithms } from '@tundralibs/crypt/digest';
 *
 * validateDigestAlgorithm('SHA-256'); // Valid, no error
 * // The type already rejects 'MD5'; the runtime guard catches untyped input.
 * validateDigestAlgorithm('MD5' as DigestAlgorithms); // Throws error
 * ```
 */
export const validateDigestAlgorithm = (digest: DigestAlgorithms): void => {
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(digest)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-1, SHA-256, SHA-384, or SHA-512',
    );
  }
};
