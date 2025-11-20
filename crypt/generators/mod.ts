/**
 * Cryptographic Generators Module
 *
 * This module provides various cryptographic generators for secrets, keys, and mnemonics.
 * All generators use cryptographically secure random number generation.
 */

// Export secret generators
export {
  generateAlphanumericSecret,
  generateBase64Secret,
  generateHexSecret,
  generatePassword,
  generateToken,
  type SecretEncoding,
  secretGenerator,
  type SecretGeneratorOptions,
} from "./secret.ts";

// Export key generators
export {
  type ECKeyOptions,
  type EllipticCurve,
  type GeneratedKeyPair,
  generateECDHKeys,
  generateECDSAKeys,
  generateECKeyPair,
  generateKeyPair,
  generateRSAEncryptionKeys,
  generateRSAKeyPair,
  generateRSASigningKeys,
  type KeyAlgorithm,
  type KeyFormat,
  type RSAHashAlgorithm,
  type RSAKeyOptions,
  type RSAKeySize,
} from "./key.ts";

// Export BIP39 mnemonic generators
export {
  type BIP39Options,
  type BIP39Result,
  type BIP39WordCount,
  generate12WordSeed,
  generate24WordSeed,
  generateBIP39Mnemonic,
  generateSeedPhrase,
  mnemonicToSeed,
  validateBIP39Mnemonic,
  validateSeedPhrase,
} from "./bip39.ts";

// Export random number generators
export {
  randomFloat,
  randomInt,
  randomNumber,
  type RandomNumberOptions,
} from "./random.ts";
