/**
 * @fileoverview Digest helper functions.
 *
 * Internal helper functions for digest algorithm validation.
 *
 * @module
 * @internal
 */

import { DigestAlgorithms } from './types/mod.ts';

/**
 * Validates that the digest algorithm is supported for HMAC operations.
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
      'Invalid HMAC hash. Must be SHA-1, SHA-256, SHA-384 or SHA-512',
    );
  }
};
