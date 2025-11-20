import { DigestAlgorithms } from "./types.ts";

/**
 * Validates that the digest algorithm is supported for HMAC operations.
 *
 * @param {DigestAlgorithms} digest - The digest algorithm to validate ({@link DigestAlgorithms})
 * @throws {Error} When the digest algorithm is not supported
 *
 * @example
 * ```typescript
 * validateDigestAlgorithm('SHA-256'); // Valid, no error
 * validateDigestAlgorithm('MD5'); // Throws error
 * ```
 */
export const validateDigestAlgorithm = (digest: DigestAlgorithms): void => {
  if (!["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(digest)) {
    throw new Error(
      "Invalid HMAC hash. Must be SHA-1, SHA-256, SHA-384 or SHA-512",
    );
  }
};
