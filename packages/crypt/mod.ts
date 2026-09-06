/**
 * @fileoverview Main entry point for the crypt package.
 *
 * Re-exports all cryptographic functions and types including:
 * - Digest (hashing)
 * - Encryption/Decryption (AES, RSA)
 * - Signing/Verification (HMAC, RSA)
 * - JWT (issue, verify)
 * - OTP (HOTP, TOTP)
 * - Generators (keys, secrets, BIP39)
 *
 * @module
 *
 * @example
 * ```typescript
 * import { hash, encryptAES, signHMAC } from '@tundralibs/crypt';
 *
 * const hashed = await hash('my data');
 * const encrypted = await encryptAES('secret data', 'password');
 * const signature = await signHMAC('data', 'key');
 * ```
 */

import { digest } from './digest/mod.ts';

export {
  digest,
  DIGEST_OUTPUT_BYTES,
  type DigestAlgorithms,
  type DigestOptions,
  pbkdf2,
  PBKDF2_PASSWORD_ITERATIONS,
  type PBKDF2Hash,
  pbkdf2Hash,
  pbkdf2Verify,
  SALT_BYTES,
  sha1,
  sha256,
  sha384,
  sha512,
  validateDigestAlgorithm,
} from './digest/mod.ts';

/**
 * Convenience function for hashing data with SHA-256 (most common use case).
 * Alias for digest() with default SHA-256 algorithm.
 *
 * @param {string | Uint8Array} data - The data to hash
 * @returns {Promise<string>} The SHA-256 hash in hexadecimal format
 *
 * @example
 * ```typescript
 * const hashed = await hash('my data');
 * console.log(hashed); // SHA-256 hash
 * ```
 */
export function hash(data: string | Uint8Array): Promise<string> {
  return digest(data); // defaults to SHA-256
}

export {
  type AESKeyLength,
  type AESMode,
  type AESOptions,
  decryptAES,
  decryptRSA,
  encryptAES,
  encryptRSA,
  type RSAHashAlgorithm as RSAEncryptHashAlgorithm,
  type RSAOptions as RSAEncryptOptions,
} from './encrypt/mod.ts';

export {
  type BIP39Options,
  type BIP39Result,
  type BIP39WordCount,
  derivePBKDF2Key,
  type ECKeyOptions,
  type EllipticCurve,
  generate12WordSeed,
  generate24WordSeed,
  generateAlphanumericSecret,
  generateBase32Secret,
  generateBase64Secret,
  generateBIP39Mnemonic,
  type GeneratedKeyPair,
  generateECDHKeys,
  generateECDSAKeys,
  generateECKeyPair,
  generateEd25519Keys,
  generateHexSecret,
  generateKeyPair,
  generatePassword,
  generateRSAEncryptionKeys,
  generateRSAKeyPair,
  generateRSASigningKeys,
  generateSeedPhrase,
  generateToken,
  hkdf,
  type HKDFHash,
  type KeyAlgorithm,
  type KeyFormat,
  mnemonicToSeed,
  type PasswordOptions,
  PBKDF2_ITERATIONS,
  randomFloat,
  randomInt,
  randomNumber,
  type RandomNumberOptions,
  type RSAHashAlgorithm,
  type RSAKeyOptions,
  type RSAKeySize,
  type SecretEncoding,
  secretGenerator,
  type SecretGeneratorOptions,
  validateBIP39Mnemonic,
  validateSeedPhrase,
} from './generators/mod.ts';

export {
  issueJWT,
  JWT_DEFAULT_TYPES,
  type JWTAlgorithm,
  JWTError,
  JWTErrorCodes,
  type JWTHeader,
  type JWTIssueOptions,
  type JWTPayload,
  type JWTVerifyOptions,
  verifyJWT,
} from './JWT/mod.ts';

export {
  // type DigestAlgorithms,
  constantTimeEqual,
  generateHOTP,
  generateTOTP,
  verifyHOTP,
  verifyTOTP,
} from './OTP/mod.ts';

export {
  describeKey,
  type ECCurve,
  ecdsaDerToRaw,
  type ECHashAlgorithm,
  type ECOptions,
  type HMACHashAlgorithm,
  type HMACOptions,
  type KeyFamily,
  type KeyShape,
  type RSAHashAlgorithm as RSASignHashAlgorithm,
  type RSAOptions as RSASignOptions,
  signEC,
  signEd25519,
  signHMAC,
  type SigningKey,
  signRSA,
  verifyEC,
  verifyEd25519,
  verifyHMAC,
  verifyRSA,
} from './sign/mod.ts';

export {
  CBORError,
  type CBORErrorMeta,
  type CBORValue,
  type CoseAlgorithm,
  type CoseKeyResult,
  coseToJwk,
  decodeCBOR,
  decodeCBORItem,
} from './cbor/mod.ts';
