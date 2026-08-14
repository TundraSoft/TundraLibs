/**
 * @fileoverview Cryptographic key pair generation.
 *
 * Generates RSA, ECDSA, and ECDH key pairs with PEM export support
 * using the Web Crypto API.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { generateKeyPair } from '@tundralibs/crypt/generators';
 *
 * const { publicKey, privateKey } = await generateKeyPair('RSA-PSS');
 * ```
 */

import { encodeBase64 } from '@std/encoding';

/**
 * Supported asymmetric key algorithms for key pair generation.
 *
 * - `RSA-OAEP`: RSA with OAEP padding for encryption/decryption
 * - `RSA-PSS`: RSA with PSS padding for signing/verification
 * - `ECDSA`: Elliptic Curve Digital Signature Algorithm
 * - `ECDH`: Elliptic Curve Diffie-Hellman for key exchange
 */
export type KeyAlgorithm = 'RSA-OAEP' | 'RSA-PSS' | 'ECDSA' | 'ECDH';

/**
 * Supported elliptic curves for ECDSA and ECDH algorithms.
 *
 * - `P-256`: NIST P-256 curve (secp256r1)
 * - `P-384`: NIST P-384 curve (secp384r1)
 * - `P-521`: NIST P-521 curve (secp521r1)
 */
export type EllipticCurve = 'P-256' | 'P-384' | 'P-521';

/**
 * Supported RSA key sizes in bits.
 *
 * - `2048`: Minimum recommended size for RSA keys
 * - `3072`: Higher security RSA key size
 * - `4096`: Maximum common RSA key size
 */
export type RSAKeySize = 2048 | 3072 | 4096;

/**
 * Supported RSA hash algorithms for PSS and OAEP operations.
 */
export type RSAHashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * Output format for exported keys.
 *
 * - `PEM`: PEM format (base64 with headers)
 * - `DER`: DER format (raw binary)
 * - `JWK`: JSON Web Key format
 * - `RAW`: Raw key material (for symmetric keys only)
 */
export type KeyFormat = 'PEM' | 'DER' | 'JWK' | 'RAW';

/**
 * Configuration options for RSA key generation.
 */
export type RSAKeyOptions = {
  /** Algorithm type */
  algorithm: 'RSA-OAEP' | 'RSA-PSS';
  /** Key size in bits. Defaults to `2048`. */
  keySize?: RSAKeySize;
  /**
   * Hash algorithm to use. Defaults to `SHA-256`, matching every other
   * RSA/EC/HMAC surface in this package.
   */
  hashAlgorithm?: RSAHashAlgorithm;
  /** Export format for keys */
  format?: KeyFormat;
  /** Whether keys should be extractable */
  extractable?: boolean;
};

/**
 * Configuration options for ECDSA/ECDH key generation.
 */
export type ECKeyOptions = {
  /** Algorithm type */
  algorithm: 'ECDSA' | 'ECDH';
  /** Elliptic curve to use */
  curve: EllipticCurve;
  /** Export format for keys */
  format?: KeyFormat;
  /** Whether keys should be extractable */
  extractable?: boolean;
};

/**
 * A generated key pair containing both public and private keys.
 */
export type GeneratedKeyPair = {
  /** The public key */
  publicKey: CryptoKey;
  /** The private key */
  privateKey: CryptoKey;
  /** Public key in exported format (if format specified) */
  publicKeyExported?: string | JsonWebKey | ArrayBuffer;
  /** Private key in exported format (if format specified) */
  privateKeyExported?: string | JsonWebKey | ArrayBuffer;
};

/**
 * Generates an RSA key pair for encryption/decryption or signing/verification.
 *
 * Uses the Web Crypto API to generate cryptographically secure RSA key pairs.
 * Supports both OAEP (for encryption) and PSS (for signing) padding schemes.
 *
 * @param {RSAKeyOptions} options - Configuration options for RSA key generation
 * @returns {Promise<GeneratedKeyPair>} A promise that resolves to the generated key pair
 *
 * @throws {Error} When key generation fails
 * @throws {Error} When export format is not supported for RSA keys
 *
 * @example
 * ```typescript
 * // Generate RSA-OAEP key pair for encryption
 * const encryptionKeys = await generateRSAKeyPair({
 *   algorithm: 'RSA-OAEP',
 *   keySize: 2048,
 *   hashAlgorithm: 'SHA-256',
 *   format: 'PEM'
 * });
 * console.log(encryptionKeys.publicKeyExported); // PEM-formatted public key
 * ```
 *
 * @example
 * ```typescript
 * // Generate RSA-PSS key pair for signing
 * const signingKeys = await generateRSAKeyPair({
 *   algorithm: 'RSA-PSS',
 *   keySize: 4096,
 *   hashAlgorithm: 'SHA-512',
 *   extractable: true
 * });
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey} Web Crypto generateKey
 */
export const generateRSAKeyPair = async (
  options: RSAKeyOptions,
): Promise<GeneratedKeyPair> => {
  const {
    algorithm,
    keySize = 2048,
    hashAlgorithm = 'SHA-256',
    format,
    extractable = true,
  } = options;

  // Generate the key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: algorithm,
      modulusLength: keySize,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: hashAlgorithm,
    },
    extractable,
    algorithm === 'RSA-OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify'],
  );

  const result: GeneratedKeyPair = {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };

  // Export keys if format is specified
  if (format && extractable) {
    if (format === 'PEM') {
      // Export as PEM format
      const publicDER = await crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey,
      );
      const privateDER = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey,
      );

      result.publicKeyExported = derToPem(publicDER, 'PUBLIC KEY');
      result.privateKeyExported = derToPem(privateDER, 'PRIVATE KEY');
    } else if (format === 'DER') {
      // Export as DER format
      result.publicKeyExported = await crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey,
      );
      result.privateKeyExported = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey,
      );
    } else if (format === 'JWK') {
      // Export as JWK format
      result.publicKeyExported = await crypto.subtle.exportKey(
        'jwk',
        keyPair.publicKey,
      );
      result.privateKeyExported = await crypto.subtle.exportKey(
        'jwk',
        keyPair.privateKey,
      );
    } else {
      throw new Error(
        'Unsupported format for RSA keys. Use "PEM", "DER", or "JWK"',
      );
    }
  }

  return result;
};

/**
 * Generates an ECDSA or ECDH key pair for signing/verification or key exchange.
 *
 * Uses the Web Crypto API to generate cryptographically secure elliptic curve key pairs.
 * Supports multiple NIST curves for different security levels.
 *
 * @param {ECKeyOptions} options - Configuration options for EC key generation
 * @returns {Promise<GeneratedKeyPair>} A promise that resolves to the generated key pair
 *
 * @throws {Error} When key generation fails
 * @throws {Error} When export format is not supported for EC keys
 *
 * @example
 * ```typescript
 * // Generate ECDSA key pair for signing
 * const signingKeys = await generateECKeyPair({
 *   algorithm: 'ECDSA',
 *   curve: 'P-256',
 *   format: 'JWK'
 * });
 * console.log(signingKeys.publicKeyExported); // JWK-formatted public key
 * ```
 *
 * @example
 * ```typescript
 * // Generate ECDH key pair for key exchange
 * const exchangeKeys = await generateECKeyPair({
 *   algorithm: 'ECDH',
 *   curve: 'P-384',
 *   extractable: true
 * });
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey} Web Crypto generateKey
 */
export const generateECKeyPair = async (
  options: ECKeyOptions,
): Promise<GeneratedKeyPair> => {
  const { algorithm, curve, format, extractable = true } = options;

  // Generate the key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: algorithm,
      namedCurve: curve,
    },
    extractable,
    algorithm === 'ECDSA' ? ['sign', 'verify'] : ['deriveKey'],
  );

  const result: GeneratedKeyPair = {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };

  // Export keys if format is specified
  if (format && extractable) {
    if (format === 'PEM') {
      // Export as PEM format
      const publicDER = await crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey,
      );
      const privateDER = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey,
      );

      result.publicKeyExported = derToPem(publicDER, 'PUBLIC KEY');
      result.privateKeyExported = derToPem(privateDER, 'PRIVATE KEY');
    } else if (format === 'DER') {
      // Export as DER format
      result.publicKeyExported = await crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey,
      );
      result.privateKeyExported = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey,
      );
    } else if (format === 'JWK') {
      // Export as JWK format
      result.publicKeyExported = await crypto.subtle.exportKey(
        'jwk',
        keyPair.publicKey,
      );
      result.privateKeyExported = await crypto.subtle.exportKey(
        'jwk',
        keyPair.privateKey,
      );
    } else if (format === 'RAW') {
      // RAW is public-key-only for EC: the raw encoding is the uncompressed
      // curve point, which a private key has no equivalent for. Export the
      // public key and leave `privateKeyExported` undefined — the previous code
      // exported the public key and then unconditionally threw, so RAW could
      // never return a value despite being an advertised capability.
      result.publicKeyExported = await crypto.subtle.exportKey(
        'raw',
        keyPair.publicKey,
      );
    } else {
      throw new Error(
        'Unsupported format for EC keys. Use "PEM", "DER", "JWK", or "RAW" (public key only)',
      );
    }
  }

  return result;
};

/**
 * Generates a key pair using simplified parameters.
 *
 * Convenience function that provides sensible defaults for common use cases.
 *
 * @param {KeyAlgorithm} algorithm - The key algorithm to use
 * @param {KeyFormat} [format] - Export format for the keys
 * @returns {Promise<GeneratedKeyPair>} A promise that resolves to the generated key pair
 *
 * @example
 * ```typescript
 * // Generate RSA-OAEP keys with defaults (2048-bit, SHA-256)
 * const keys = await generateKeyPair('RSA-OAEP', 'PEM');
 * ```
 *
 * @example
 * ```typescript
 * // Generate ECDSA keys with defaults (P-256 curve)
 * const keys = await generateKeyPair('ECDSA', 'JWK');
 * ```
 */
export const generateKeyPair = async (
  algorithm: KeyAlgorithm,
  format?: KeyFormat,
): Promise<GeneratedKeyPair> => {
  switch (algorithm) {
    case 'RSA-OAEP':
      return await generateRSAKeyPair({
        algorithm: 'RSA-OAEP',
        keySize: 2048,
        hashAlgorithm: 'SHA-256',
        format,
      });

    case 'RSA-PSS':
      return await generateRSAKeyPair({
        algorithm: 'RSA-PSS',
        keySize: 2048,
        hashAlgorithm: 'SHA-256',
        format,
      });

    case 'ECDSA':
      return await generateECKeyPair({
        algorithm: 'ECDSA',
        curve: 'P-256',
        format,
      });

    case 'ECDH':
      return await generateECKeyPair({
        algorithm: 'ECDH',
        curve: 'P-256',
        format,
      });

    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
};

/**
 * Converts DER-encoded key data to PEM format.
 *
 * @param {ArrayBuffer} der - DER-encoded key data
 * @param {string} type - Key type for PEM header/footer
 * @returns {string} PEM-formatted key
 */
const derToPem = (der: ArrayBuffer, type: string): string => {
  const base64 = encodeBase64(new Uint8Array(der));
  const pemBody = base64.match(/.{1,64}/g)?.join('\n') || base64;
  return `-----BEGIN ${type}-----\n${pemBody}\n-----END ${type}-----`;
};

// Convenience aliases for common key types

/**
 * {@link generateRSAKeyPair} preset to RSA-OAEP with SHA-256, the pairing
 * `encryptRSA`/`decryptRSA` expect. The keys are always extractable — call
 * `generateRSAKeyPair` directly to opt out.
 *
 * @param keySize - Modulus size in bits; 2048 is the floor, larger costs generation and per-operation time
 * @param format - Encoding for the `*Exported` fields. Omit and only the {@link CryptoKey} handles come back.
 *
 * @throws {Error} If `format` is `'RAW'`, which RSA cannot export
 *
 * @example
 * ```ts
 * const { publicKeyExported } = await generateRSAEncryptionKeys(2048, 'PEM');
 * console.log(publicKeyExported); // -----BEGIN PUBLIC KEY----- …
 * ```
 */
export const generateRSAEncryptionKeys = (
  keySize: RSAKeySize = 2048,
  format?: KeyFormat,
): Promise<GeneratedKeyPair> =>
  generateRSAKeyPair({
    algorithm: 'RSA-OAEP',
    keySize,
    hashAlgorithm: 'SHA-256',
    format,
  });

/**
 * {@link generateRSAKeyPair} preset to RSA-PSS with SHA-256, for the `PS*`
 * side of `signRSA`/`verifyRSA`. The keys are always extractable — call
 * `generateRSAKeyPair` directly to opt out.
 *
 * PSS and PKCS#1 v1.5 are different primitives, so these keys cannot serve
 * the `RS*` algorithms: signing `RS256` with one is refused rather than
 * silently downgraded.
 *
 * @param keySize - Modulus size in bits; 2048 is the floor, larger costs generation and per-operation time
 * @param format - Encoding for the `*Exported` fields. Omit and only the {@link CryptoKey} handles come back.
 *
 * @throws {Error} If `format` is `'RAW'`, which RSA cannot export
 */
export const generateRSASigningKeys = (
  keySize: RSAKeySize = 2048,
  format?: KeyFormat,
): Promise<GeneratedKeyPair> =>
  generateRSAKeyPair({
    algorithm: 'RSA-PSS',
    keySize,
    hashAlgorithm: 'SHA-256',
    format,
  });

/**
 * {@link generateECKeyPair} preset to ECDSA, for `signEC`/`verifyEC`. The keys
 * are always extractable — call `generateECKeyPair` directly to opt out.
 *
 * @param curve - Curve, which also settles the JOSE algorithm and its digest: P-256 → ES256, P-384 → ES384, P-521 → ES512
 * @param format - Encoding for the `*Exported` fields. Omit and only the {@link CryptoKey} handles come back. `'RAW'` exports the public key alone, leaving `privateKeyExported` undefined.
 */
export const generateECDSAKeys = (
  curve: EllipticCurve = 'P-256',
  format?: KeyFormat,
): Promise<GeneratedKeyPair> =>
  generateECKeyPair({
    algorithm: 'ECDSA',
    curve,
    format,
  });

/**
 * {@link generateECKeyPair} preset to ECDH for key agreement. The keys are
 * always extractable — call `generateECKeyPair` directly to opt out.
 *
 * Granted `deriveKey` only, so `crypto.subtle.deriveBits` will reject the
 * private key; derive a {@link CryptoKey} and export it if you need raw bytes.
 * Both sides must share a curve — a P-256 key cannot agree with a P-384 one.
 *
 * @param curve - Curve both parties must agree on
 * @param format - Encoding for the `*Exported` fields. Omit and only the {@link CryptoKey} handles come back. `'RAW'` exports the public key alone, which is the usual thing to hand a peer.
 */
export const generateECDHKeys = (
  curve: EllipticCurve = 'P-256',
  format?: KeyFormat,
): Promise<GeneratedKeyPair> =>
  generateECKeyPair({
    algorithm: 'ECDH',
    curve,
    format,
  });
