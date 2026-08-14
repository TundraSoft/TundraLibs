/**
 * @fileoverview Digital signature generation functions.
 *
 * Provides cryptographic signing using HMAC, RSA (PSS / PKCS#1 v1.5) and
 * ECDSA via the Web Crypto API. HMAC signatures are returned as hexadecimal
 * strings; RSA and ECDSA signatures as base64.
 *
 * Every function takes a {@link SigningKey}: a PEM string or raw secret, an
 * already-imported `CryptoKey`, or a JWK.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { signEC, signHMAC, signRSA } from '@tundralibs/crypt/sign';
 *
 * declare const privateKeyPEM: string;
 * declare const ecPrivateKeyPEM: string;
 *
 * const hmacSig = await signHMAC('data', 'secret');
 * const rsaSig = await signRSA('data', privateKeyPEM);
 * const ecSig = await signEC('data', ecPrivateKeyPEM);
 * ```
 */

import { validateDigestAlgorithm } from '../digest/mod.ts';
import type {
  ECOptions,
  HMACOptions,
  RSAOptions,
  SigningKey,
} from './types/mod.ts';
import {
  EC_CURVE_HASH,
  EC_SIGNATURE_BYTES,
  importSigningKey,
  resolveECCurve,
} from './keys.ts';
import { encodeBase64, encodeHex } from '@std/encoding';

/**
 * Signs data using HMAC with the specified hash algorithm.
 *
 * Creates a Hash-based Message Authentication Code (HMAC) using the Web Crypto API.
 * The signature is returned as a hexadecimal string for easy transmission and storage.
 *
 * @param {string | Uint8Array} data - The data to sign, either as a string or binary data
 * @param {SigningKey} secret - The secret key for signing: a raw secret string
 *   (any length), an `oct` JWK, or an HMAC `CryptoKey`
 * @param {HMACOptions} [options] - Optional settings (`hashAlgorithm`, default `'SHA-256'`)
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the signature
 *
 * @throws {Error} When the hash algorithm is not supported (must be a {@link DigestAlgorithms} value)
 * @throws {Error} When a supplied `CryptoKey` or JWK is not an HMAC key, binds a
 *   different hash, or does not permit signing
 * @throws {Error} When signing operation fails
 *
 * @example
 * ```typescript
 * // Sign a string with SHA-256 (default)
 * const signature = await signHMAC('my data', 'abcdefghijklmnopqrstuvwx');
 * console.log(signature); // "5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5"
 *
 * // Sign with specific hash algorithm
 * const signature512 = await signHMAC('important data', 'mySecretKey', { hashAlgorithm: 'SHA-512' });
 * ```
 *
 * @example
 * ```typescript
 * // Sign binary data with SHA-384
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const signature = await signHMAC(binaryData, 'mySecretKey', { hashAlgorithm: 'SHA-384' });
 * console.log(signature); // HMAC-SHA-384 signature of the binary data
 * ```
 *
 * @see {@link verifyHMAC} for signature verification
 * @see {@link HMACOptions} for available options
 * @see {@link SigningKey} for the accepted key forms
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign} Web Crypto API sign
 */
export const signHMAC = async (
  data: string | Uint8Array,
  secret: SigningKey,
  options?: HMACOptions,
): Promise<string> => {
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';
  validateDigestAlgorithm(hashAlgorithm);

  const key = await importSigningKey(secret, {
    family: 'HMAC',
    purpose: 'sign',
    hash: hashAlgorithm,
  });

  const dataToSign = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  const signature = await crypto.subtle.sign(
    {
      name: 'HMAC',
      hash: hashAlgorithm,
    },
    key,
    dataToSign as BufferSource,
  );

  return encodeHex(signature);
};

/**
 * Signs data using RSA (RSASSA-PSS by default, or RSASSA-PKCS1-v1_5).
 *
 * Uses the Web Crypto API for RSA digital signature creation. The signature is returned
 * as a base64-encoded string for easy transmission and storage. The key size
 * comes entirely from the supplied key — there is no size option.
 *
 * @param {string | Uint8Array} data - The data to sign, either as a string or binary data
 * @param {SigningKey} privateKey - The RSA private key: a PEM (PKCS#8) string,
 *   an RSA `CryptoKey`, or a private RSA JWK
 * @param {RSAOptions} [options] - Optional settings: `hashAlgorithm` (default `'SHA-256'`)
 *   and `scheme` (`'PSS'` default, or `'PKCS1'`)
 * @returns {Promise<string>} A promise that resolves to the base64 representation of the signature
 *
 * @throws {Error} When the hash algorithm is not supported (must be SHA-256, SHA-384, or SHA-512)
 * @throws {Error} When the private key is in invalid PEM format
 * @throws {Error} When a supplied `CryptoKey` or JWK is not an RSA private key
 *   for the requested scheme and hash, or does not permit signing
 * @throws {Error} When the RSA signing operation fails
 *
 * @example
 * ```typescript
 * const privateKey = `-----BEGIN PRIVATE KEY-----
 * MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
 * -----END PRIVATE KEY-----`;
 *
 * // Sign with defaults (RSA-PSS, SHA-256)
 * const signature = await signRSA('important document', privateKey);
 * console.log(signature); // Base64-encoded RSA-PSS signature
 *
 * // Sign with a different hash and the PKCS#1 v1.5 scheme
 * const signature512 = await signRSA('document', privateKey, {
 *   hashAlgorithm: 'SHA-512',
 *   scheme: 'PKCS1',
 * });
 * ```
 *
 * @see {@link verifyRSA} for signature verification
 * @see {@link RSAOptions} for available options
 * @see {@link SigningKey} for the accepted key forms
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign} Web Crypto API sign
 */
export const signRSA = async (
  data: string | Uint8Array,
  privateKey: SigningKey,
  options?: RSAOptions,
): Promise<string> => {
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';

  if (!['SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-256, SHA-384, or SHA-512',
    );
  }

  // Scheme selects the RSA signature primitive: RSASSA-PKCS1-v1_5 (RFC 7518
  // `RS*`) or RSASSA-PSS (RFC 7518 `PS*`, the default).
  const scheme = options?.scheme ?? 'PSS';

  // Import the private key, bound to the chosen scheme
  const cryptoKey = await importSigningKey(privateKey, {
    family: 'RSA',
    purpose: 'sign',
    hash: hashAlgorithm,
    scheme,
  });

  // Prepare the data to sign
  const dataToSign = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // PSS salt length tracks the hash length; PKCS#1 v1.5 takes no salt.
  const saltLength = hashAlgorithm === 'SHA-384'
    ? 48
    : hashAlgorithm === 'SHA-512' //NOSONAR
    ? 64
    : 32;

  // Sign the data
  const signature = await crypto.subtle.sign(
    scheme === 'PKCS1'
      ? { name: 'RSASSA-PKCS1-v1_5' }
      : { name: 'RSA-PSS', saltLength },
    cryptoKey,
    dataToSign as BufferSource,
  );

  // Return the signature as base64
  return btoa(String.fromCodePoint(...new Uint8Array(signature)));
};

/**
 * Signs data using ECDSA on a NIST P-curve.
 *
 * ## Signature encoding — raw `R‖S`, never DER
 *
 * The returned base64 decodes to the **fixed-width `R‖S` concatenation** that
 * RFC 7515 §3.4 mandates for JOSE — 64 bytes for P-256, 96 for P-384 and 132
 * for P-521 — *not* the ASN.1/DER `SEQUENCE { INTEGER r, INTEGER s }` that
 * OpenSSL and most non-web tooling emit. The two are not interchangeable: DER
 * is variable-length and self-describing, `R‖S` is fixed-width and bare. This
 * function emits only `R‖S`, and {@link verifyEC} accepts only `R‖S`, so a
 * signature produced here drops straight into a JWS without re-encoding. To
 * interoperate with a DER-based tool, convert at that boundary.
 *
 * ## Curve and hash
 *
 * Both are read from the key by default. The hash follows the RFC 7518 §3.4
 * pairing for the key's curve (P-256→SHA-256, P-384→SHA-384, P-521→SHA-512),
 * which is what any `ES*` verifier expects. `options.curve` *pins* the
 * expectation rather than selecting one — a key on a different curve is
 * rejected, never coerced.
 *
 * @param {string | Uint8Array} data - The data to sign, either as a string or binary data
 * @param {SigningKey} privateKey - The EC private key: a PEM string (PKCS#8
 *   `PRIVATE KEY` or SEC1 `EC PRIVATE KEY`), an ECDSA `CryptoKey`, or a private
 *   EC JWK
 * @param {ECOptions} [options] - Optional settings: `hashAlgorithm` (default:
 *   the curve's RFC 7518 pairing) and `curve` (default: read from the key)
 * @returns {Promise<string>} A promise that resolves to the base64
 *   representation of the raw `R‖S` signature
 *
 * @throws {Error} When the supplied key is not an EC key, or lies on a curve
 *   other than `options.curve` when that is set
 * @throws {Error} When the curve is not P-256, P-384 or P-521
 * @throws {Error} When the private key is in invalid or encrypted PEM format
 * @throws {Error} When a supplied `CryptoKey` or JWK is not an ECDSA private
 *   key, or does not permit signing
 * @throws {Error} When the ECDSA signing operation fails
 *
 * @example
 * ```typescript
 * const privateKey = `-----BEGIN PRIVATE KEY-----
 * MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...
 * -----END PRIVATE KEY-----`;
 *
 * // Curve and hash both come from the key (P-256 → SHA-256)
 * const signature = await signEC('important document', privateKey);
 *
 * // Pin the curve: a key on any other curve is rejected
 * const pinned = await signEC('document', privateKey, { curve: 'P-256' });
 * ```
 *
 * @see {@link verifyEC} for signature verification
 * @see {@link ECOptions} for available options
 * @see {@link SigningKey} for the accepted key forms
 * @see {@link https://www.rfc-editor.org/rfc/rfc7515#section-3.4} RFC 7515 §3.4 — `R‖S` encoding
 */
export const signEC = async (
  data: string | Uint8Array,
  privateKey: SigningKey,
  options?: ECOptions,
): Promise<string> => {
  const curve = resolveECCurve(privateKey, options?.curve);
  const hashAlgorithm = options?.hashAlgorithm ?? EC_CURVE_HASH[curve];

  if (!['SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-256, SHA-384, or SHA-512',
    );
  }

  const cryptoKey = await importSigningKey(privateKey, {
    family: 'EC',
    purpose: 'sign',
    hash: hashAlgorithm,
    curve,
  });

  const dataToSign = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Web Crypto's ECDSA already produces the raw R‖S concatenation, so nothing
  // is re-encoded here — the bytes go out exactly as the primitive made them.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: hashAlgorithm },
    cryptoKey,
    dataToSign as BufferSource,
  );

  const bytes = new Uint8Array(signature);
  const expected = EC_SIGNATURE_BYTES[curve];
  if (bytes.length !== expected) {
    // Unreachable on a conforming runtime; asserted because a runtime that
    // handed back DER here would silently mint unverifiable signatures.
    throw new Error(
      `ECDSA produced a ${bytes.length}-byte signature but ${curve} requires ` +
        `${expected} bytes of raw R‖S`,
    );
  }

  return encodeBase64(bytes);
};
