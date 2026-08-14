/**
 * @fileoverview Data encryption functions.
 *
 * Provides symmetric (AES) and asymmetric (RSA) encryption using the
 * Web Crypto API. Supports AES-GCM, AES-CBC, AES-CTR modes and RSA-OAEP.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { encryptAES, encryptRSA } from '@tundralibs/crypt/encrypt';
 *
 * declare const publicKeyPEM: string;
 *
 * const encrypted = await encryptAES('secret data', 'password');
 * const rsaEncrypted = await encryptRSA('data', publicKeyPEM);
 * ```
 */

import { encodeHex } from '@std/encoding';
import type { AESOptions, RSAOptions } from './types/mod.ts';
import { deriveMacSecret, derivePBKDF2Key, SALT_BYTES } from './kdf.ts';
import { signHMAC } from '../sign/sign.ts';

/**
 * GCM nonce length in bytes. 96 bits is the length NIST SP 800-38D specifies
 * and the only one the GHASH construction handles without an extra hashing
 * step, making it the interoperable default across crypto libraries.
 * {@link decryptAES} reads the IV length from the envelope itself, so
 * ciphertexts produced before this constant existed (16-byte IVs) still
 * decrypt.
 */
const GCM_IV_BYTES = 12;

/** CBC initialization-vector length in bytes (always one AES block). */
const CBC_IV_BYTES = 16;

/**
 * Encrypts data using AES with the specified mode and key length.
 *
 * The AES key is derived from the supplied secret with PBKDF2-SHA-256
 * using a fresh random per-message salt, replacing the prior zero-padding
 * scheme. The salt is embedded in the output so decrypt can derive the
 * same key.
 *
 * Output format (all components hex-encoded):
 * - `GCM` (default, AEAD): `{dataHex}:{ivHex}:{saltHex}`.
 * - `CBC` / `CTR`: `{dataHex}:{ivHex}:{saltHex}:{macHex}` — a 4th
 *   encrypt-then-MAC part.
 *
 * IV lengths: GCM uses the standard 12-byte (96-bit) nonce; CBC uses a
 * 16-byte block IV; CTR uses a 16-byte counter block. {@link decryptAES}
 * takes the IV length from the envelope, so ciphertexts written when GCM
 * still used a 16-byte IV continue to decrypt.
 *
 * Security — all modes are authenticated:
 * `GCM` is authenticated on its own (AEAD: it embeds an auth tag). `CBC` and
 * `CTR` have no native integrity, so they are wrapped with **encrypt-then-MAC**:
 * an HMAC-SHA-256 (via {@link signHMAC}) computed over the full `data:iv:salt`
 * envelope and keyed by a secret domain-separated from the AES-derivation
 * secret. {@link decryptAES} verifies this MAC (constant-time) and rejects
 * tampered ciphertext, closing the bit-flipping / padding-oracle / chosen-
 * ciphertext exposure those modes otherwise have. Prefer `GCM` (one standard
 * AEAD primitive); reach for `CBC`/`CTR` only for external-format compatibility.
 *
 * @param {string | Uint8Array} data - The data to encrypt
 * @param {string} secret - The secret used to derive the AES key
 * @param {AESOptions} [options] - Optional encryption settings (mode and keyLength)
 * @returns {Promise<string>} Hex-encoded envelope: `data:iv:salt` for GCM,
 *   `data:iv:salt:mac` for CBC/CTR
 *
 * @throws {Error} When the encryption mode is invalid (must be GCM, CBC, or CTR)
 * @throws {Error} When the key length is not supported (must be 128, 192, or 256)
 *
 * @example
 * ```typescript
 * const encrypted = await encryptAES('my sensitive data', 'anySecret');
 * // "a263…:c1d2…:5fe1…"  (data:iv:salt)
 * ```
 *
 * @see {@link decryptAES} for decryption
 * @see {@link AESOptions} for available options
 */
export const encryptAES = async (
  data: string | Uint8Array,
  secret: string,
  options?: AESOptions,
): Promise<string> => {
  const mode = options?.mode ?? 'GCM';
  const keyLength = options?.keyLength ?? 256;

  if (!['GCM', 'CBC', 'CTR'].includes(mode)) {
    throw new Error(
      'Invalid AES encryption mode. Must be GCM, CBC, or CTR',
    );
  }

  if (![128, 192, 256].includes(keyLength)) {
    throw new Error(
      'Invalid AES key length. Must be 128, 192, or 256',
    );
  }

  const algorithm: 'AES-GCM' | 'AES-CBC' | 'AES-CTR' = `AES-${mode}`;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await derivePBKDF2Key(secret, salt, algorithm, keyLength);

  const dataToEncrypt = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  const blob = mode === 'CTR'
    ? await encryptAESCTR(key, dataToEncrypt)
    : await encryptAESGCMCBC(key, algorithm, dataToEncrypt);

  const envelope = `${blob}:${encodeHex(salt)}`;

  // GCM is authenticated (AEAD) on its own. CBC/CTR are not, so authenticate
  // them with encrypt-then-MAC: an HMAC-SHA-256 over the full `data:iv:salt`
  // envelope, keyed by a domain-separated secret. decryptAES verifies it
  // (constant-time) before decrypting, so tampered ciphertext is rejected.
  if (mode === 'GCM') {
    return envelope;
  }
  const mac = await signHMAC(envelope, deriveMacSecret(secret));
  return `${envelope}:${mac}`;
};

/**
 * Encrypts data using RSA-OAEP encryption.
 *
 * Uses the Web Crypto API for secure RSA encryption. The input must be a PEM-formatted
 * public key string. The key size is read from the key itself — OAEP's maximum
 * plaintext size (`modulusLength/8 - 2*hashLen - 2` bytes) is enforced against
 * the actual modulus of the supplied key, not a caller-declared size.
 *
 * @param {string | Uint8Array} data - The data to encrypt (limited by the RSA key's modulus)
 * @param {string} publicKey - The RSA public key in PEM format
 * @param {RSAOptions} [options] - Optional encryption settings (OAEP hash algorithm)
 * @returns {Promise<string>} A promise that resolves to the base64-encoded encrypted data
 *
 * @throws {Error} When the hash algorithm is not supported (must be SHA-1, SHA-256, SHA-384, or SHA-512)
 * @throws {Error} When the public key format is invalid
 * @throws {Error} When the data is too large for the supplied RSA key
 * @throws {Error} When encryption operation fails
 *
 * @example
 * ```typescript
 * const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
 * MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
 * -----END PUBLIC KEY-----`;
 *
 * // Encrypt with the default OAEP hash (SHA-256)
 * const encrypted = await encryptRSA('secret data', publicKeyPEM);
 * console.log(encrypted); // Base64-encoded encrypted data
 *
 * // Encrypt with a custom OAEP hash
 * const encrypted2 = await encryptRSA('secret data', publicKeyPEM, { hashAlgorithm: 'SHA-512' });
 * ```
 *
 * @see {@link decryptRSA} for decryption
 * @see {@link RSAOptions} for available options
 */
export const encryptRSA = async (
  data: string | Uint8Array,
  publicKey: string,
  options?: RSAOptions,
): Promise<string> => {
  // Apply defaults
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';

  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-1, SHA-256, SHA-384, or SHA-512',
    );
  }

  // Remove PEM headers and decode base64
  const pemContents = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replaceAll(/\s/g, '');

  let keyData: Uint8Array;
  try {
    keyData = Uint8Array.from(
      atob(pemContents),
      (c) => c.codePointAt(0) ?? 0,
    );
  } catch {
    throw new Error('Invalid PEM public key format');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    keyData as BufferSource,
    {
      name: 'RSA-OAEP',
      hash: hashAlgorithm,
    },
    false,
    ['encrypt'],
  );

  const dataToEncrypt = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Check data size limit (RSA-OAEP can only encrypt data smaller than the
  // modulus minus padding overhead). The modulus length comes from the key
  // that was actually imported — not from an option — so a 4096-bit key gets
  // its full 446-byte (SHA-256) capacity and an oversized payload against a
  // 2048-bit key is rejected here with a clear message instead of surfacing
  // as an opaque DataError from the Web Crypto API.
  // Determine hash output size based on algorithm
  let hashOutputSize: number;
  if (hashAlgorithm === 'SHA-1') {
    hashOutputSize = 20;
  } else if (hashAlgorithm === 'SHA-256') {
    hashOutputSize = 32;
  } else if (hashAlgorithm === 'SHA-384') {
    hashOutputSize = 48;
  } else {
    hashOutputSize = 64; // SHA-512
  }

  const { modulusLength } = cryptoKey.algorithm as RsaHashedKeyAlgorithm;
  const maxDataSize = Math.floor(modulusLength / 8) - 2 * hashOutputSize - 2;

  if (dataToEncrypt.length > maxDataSize) {
    throw new Error(
      `Data too large for RSA key. Maximum size: ${maxDataSize} bytes`,
    );
  }

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    cryptoKey,
    dataToEncrypt as BufferSource,
  );

  // Return as base64 for RSA (standard format)
  return btoa(String.fromCodePoint(...new Uint8Array(encrypted)));
};

/**
 * Encrypts data using AES-CTR mode.
 *
 * @param key - The imported crypto key
 * @param data - The data to encrypt
 * @returns Promise resolving to encrypted data and counter, separated by a colon
 */
const encryptAESCTR = async (
  key: CryptoKey,
  data: Uint8Array,
): Promise<string> => {
  // Generate a random 16-byte counter
  const counter = crypto.getRandomValues(new Uint8Array(16));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-CTR',
      counter,
      length: 64, // Counter length in bits
    },
    key,
    data as BufferSource,
  );

  return `${encodeHex(encrypted)}:${encodeHex(counter)}`;
};

/**
 * Encrypts data using AES-GCM or AES-CBC mode.
 *
 * GCM uses the standard 12-byte (96-bit) nonce ({@link GCM_IV_BYTES});
 * CBC uses a full 16-byte block IV ({@link CBC_IV_BYTES}).
 *
 * @param key - The imported crypto key
 * @param algorithm - The algorithm name (AES-GCM or AES-CBC)
 * @param data - The data to encrypt
 * @returns Promise resolving to encrypted data and IV, separated by a colon
 */
const encryptAESGCMCBC = async (
  key: CryptoKey,
  algorithm: string,
  data: Uint8Array,
): Promise<string> => {
  const iv = crypto.getRandomValues(
    new Uint8Array(algorithm === 'AES-GCM' ? GCM_IV_BYTES : CBC_IV_BYTES),
  );

  // Note: AES-CBC uses PKCS#7 padding by default in Web Crypto API
  const encryptConfig: AesGcmParams | AesCbcParams = {
    name: algorithm,
    iv,
  };

  const encrypted = await crypto.subtle.encrypt(
    encryptConfig,
    key,
    data as BufferSource,
  );

  return `${encodeHex(encrypted)}:${encodeHex(iv)}`;
};
