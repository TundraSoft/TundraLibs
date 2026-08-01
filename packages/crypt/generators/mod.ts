/**
 * @fileoverview Generators module exports.
 *
 * Re-exports cryptographic generators for secrets, keys, random values,
 * passphrases, and BIP39 mnemonics.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { generateBIP39Mnemonic, generateKeyPair, secretGenerator } from '@tundralibs/crypt/generators';
 *
 * const secret = secretGenerator(32, 'BASE32');
 * const { publicKey, privateKey } = await generateKeyPair('RSA-PSS');
 * const { phrase } = await generateBIP39Mnemonic({ wordCount: 12 });
 * ```
 */

// Export secret generators
export {
  generateAlphanumericSecret,
  generateBase32Secret,
  generateBase64Secret,
  generateHexSecret,
  generatePassword,
  generateToken,
  type PasswordOptions,
  type SecretEncoding,
  secretGenerator,
  type SecretGeneratorOptions,
} from './secret.ts';

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
} from './key.ts';

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
} from './bip39.ts';

// Export random number generators
export {
  randomFloat,
  randomInt,
  randomNumber,
  type RandomNumberOptions,
} from './random.ts';
