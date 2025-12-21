/**
 * Supported signing modes combining algorithm and hash function.
 *
 * HMAC Format: `HMAC:{HashAlgorithm}` where HashAlgorithm is one of the supported
 * cryptographic hash functions.
 *
 * RSA Format: `RSA-PSS:{KeyLength}:{HashAlgorithm}` where:
 * - KeyLength: 2048, 3072, or 4096 bits (secure RSA key sizes)
 * - HashAlgorithm: SHA-256, SHA-384, or SHA-512 (SHA-1 deprecated for RSA)
 *
 * @see {@link DigestAlgorithms} for supported hash algorithms
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign} Web Crypto API sign
 */
export type SigningModes =
  | 'HMAC:SHA-1'
  | 'HMAC:SHA-256'
  | 'HMAC:SHA-384'
  | 'HMAC:SHA-512'
  | 'RSA-PSS:2048:SHA-256'
  | 'RSA-PSS:2048:SHA-384'
  | 'RSA-PSS:2048:SHA-512'
  | 'RSA-PSS:3072:SHA-256'
  | 'RSA-PSS:3072:SHA-384'
  | 'RSA-PSS:3072:SHA-512'
  | 'RSA-PSS:4096:SHA-256'
  | 'RSA-PSS:4096:SHA-384'
  | 'RSA-PSS:4096:SHA-512';

/**
 * Supported hash algorithms for HMAC signing.
 */
export type HMACHashAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * Supported hash algorithms for RSA-PSS signing.
 */
export type RSAHashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * Supported RSA key sizes for signing.
 */
export type RSAKeySize = 2048 | 3072 | 4096;

/**
 * Options for HMAC signing and verification.
 */
export type HMACOptions = {
  /**
   * Hash algorithm to use.
   * @default 'SHA-256'
   */
  hashAlgorithm?: HMACHashAlgorithm;
};

/**
 * Options for RSA-PSS signing and verification.
 */
export type RSAOptions = {
  /**
   * RSA key size in bits.
   * @default 2048
   */
  keySize?: RSAKeySize;

  /**
   * Hash algorithm to use.
   * @default 'SHA-256'
   */
  hashAlgorithm?: RSAHashAlgorithm;
};
