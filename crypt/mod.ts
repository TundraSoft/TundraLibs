export {
  digest,
  type DigestAlgorithms,
  type DigestOptions,
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
 * const hash = await hash('my data');
 * console.log(hash); // SHA-256 hash
 * ```
 */
export async function hash(data: string | Uint8Array): Promise<string> {
  const { digest } = await import('./digest/mod.ts');
  return digest(data); // defaults to SHA-256
}

export {
  type AESKeyLength,
  type AESMode,
  type AESOptions,
  decrypt,
  decryptAES,
  decryptRSA,
  encrypt,
  encryptAES,
  type EncryptionModes,
  encryptRSA,
  type RSAHashAlgorithm as RSAEncryptHashAlgorithm,
  type RSAKeySize as RSAEncryptKeySize,
  type RSAOptions as RSAEncryptOptions,
} from './encrypt/mod.ts';

export {
  type BIP39Options,
  type BIP39Result,
  type BIP39WordCount,
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
  generateHexSecret,
  generateKeyPair,
  generatePassword,
  generateRSAEncryptionKeys,
  generateRSAKeyPair,
  generateRSASigningKeys,
  generateSeedPhrase,
  generateToken,
  type KeyAlgorithm,
  type KeyFormat,
  mnemonicToSeed,
  type PasswordOptions,
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
  type JWTAlgorithm,
  JWTError,
  JWTErrorCodes,
  type JWTHeader,
  type JWTPayload,
  verifyJWT,
} from './JWT/mod.ts';

export {
  // type DigestAlgorithms,
  generateHOTP,
  generateTOTP,
  verifyHOTP,
  verifyTOTP,
} from './OTP/mod.ts';

export {
  type HMACHashAlgorithm,
  type HMACOptions,
  type RSAHashAlgorithm as RSASignHashAlgorithm,
  type RSAKeySize as RSASignKeySize,
  type RSAOptions as RSASignOptions,
  sign,
  signHMAC,
  type SigningModes,
  signRSA,
  verify,
  verifyHMAC,
  verifyRSA,
} from './sign/mod.ts';
