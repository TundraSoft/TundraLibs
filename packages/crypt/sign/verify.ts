/**
 * @fileoverview Digital signature verification functions.
 *
 * Provides signature verification for HMAC, RSA (PSS / PKCS#1 v1.5) and ECDSA
 * signatures using the Web Crypto API. HMAC signatures are hex encoded; RSA and
 * ECDSA signatures are base64 encoded — matching what the sign module emits.
 *
 * Every function takes a {@link SigningKey}: a PEM string or raw secret, an
 * already-imported `CryptoKey`, or a JWK.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { verifyEC, verifyHMAC, verifyRSA } from '@tundralibs/crypt/sign';
 *
 * declare const signature: string;
 * declare const publicKeyPEM: string;
 * declare const ecPublicKeyPEM: string;
 *
 * const valid = await verifyHMAC('data', signature, 'secret');
 * const rsaValid = await verifyRSA('data', signature, publicKeyPEM);
 * const ecValid = await verifyEC('data', signature, ecPublicKeyPEM);
 * ```
 */

import { validateDigestAlgorithm } from '../digest/mod.ts';
import { decodeHex } from '@std/encoding';
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

/**
 * Verifies an HMAC signature produced by {@link signHMAC}.
 *
 * @param {string | Uint8Array} data - The data the signature covers.
 * @param {string} signature - The hex-encoded signature to verify.
 * @param {SigningKey} secret - The secret key used at signing time: a raw
 *   secret string, an `oct` JWK, or an HMAC `CryptoKey`.
 * @param {HMACOptions} [options] - Optional settings (`hashAlgorithm`, default `'SHA-256'`; must match signing).
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the signature is valid.
 *
 * @throws {Error} When the hash algorithm is not supported (must be a {@link DigestAlgorithms} value)
 * @throws {Error} When the signature is empty or not a hex string
 * @throws {Error} When a supplied `CryptoKey` or JWK is not an HMAC key, binds a
 *   different hash, or does not permit verification
 *
 * @example
 * ```ts
 * import { signHMAC } from '@tundralibs/crypt/sign';
 *
 * const signature = await signHMAC('my data', 'mysecret');
 * const isValid = await verifyHMAC('my data', signature, 'mysecret');
 * console.log(isValid); // true
 * ```
 *
 * @example
 * ```ts
 * import { signHMAC } from '@tundralibs/crypt/sign';
 *
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const signature = await signHMAC(binaryData, 'mysecret', { hashAlgorithm: 'SHA-512' });
 * const isValid = await verifyHMAC(binaryData, signature, 'mysecret', { hashAlgorithm: 'SHA-512' });
 * console.log(isValid); // true
 * ```
 *
 * @see {@link signHMAC} for signature creation
 * @see {@link HMACOptions} for available options
 * @see {@link SigningKey} for the accepted key forms
 */
export const verifyHMAC = async (
  data: string | Uint8Array,
  signature: string,
  secret: SigningKey,
  options?: HMACOptions,
): Promise<boolean> => {
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';
  validateDigestAlgorithm(hashAlgorithm);

  if (!signature || typeof signature !== 'string') {
    throw new Error('Signature must be a non-empty string');
  }

  const key = await importSigningKey(secret, {
    family: 'HMAC',
    purpose: 'verify',
    hash: hashAlgorithm,
  });

  const dataToVerify = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeHex(signature);
  } catch {
    throw new Error('Invalid signature format. Must be a hex string');
  }

  return crypto.subtle.verify(
    {
      name: 'HMAC',
      hash: hashAlgorithm,
    },
    key,
    signatureBytes as BufferSource,
    dataToVerify as BufferSource,
  );
};

/**
 * Verifies an RSA signature produced by {@link signRSA}
 * (RSASSA-PSS by default, or RSASSA-PKCS1-v1_5).
 *
 * Uses the Web Crypto API for RSA digital signature verification. Expects a
 * base64-encoded signature. The key size comes entirely from the supplied key —
 * there is no size option.
 *
 * @param {string | Uint8Array} data - The data the signature covers, either as a string or binary data
 * @param {string} signature - The signature to verify as a base64-encoded string
 * @param {SigningKey} publicKey - The RSA public key: a PEM (SPKI) string, an
 *   RSA `CryptoKey`, or a public RSA JWK
 * @param {RSAOptions} [options] - Optional settings: `hashAlgorithm` (default `'SHA-256'`)
 *   and `scheme` (`'PSS'` default, or `'PKCS1'`); both must match signing
 * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise
 *
 * @throws {Error} When the hash algorithm is not supported (must be SHA-256, SHA-384, or SHA-512)
 * @throws {Error} When the public key is in invalid PEM format
 * @throws {Error} When the signature is empty or invalid base64
 * @throws {Error} When a supplied `CryptoKey` or JWK is not an RSA public key
 *   for the requested scheme and hash, or does not permit verification
 * @throws {Error} When the RSA verification operation fails
 *
 * @example
 * ```typescript
 * const publicKey = `-----BEGIN PUBLIC KEY-----
 * MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
 * -----END PUBLIC KEY-----`;
 *
 * // Verify with defaults (RSA-PSS, SHA-256)
 * const isValid = await verifyRSA('important document', 'base64Signature==', publicKey);
 * console.log(isValid); // true if signature is valid
 *
 * // Verify a PKCS#1 v1.5 / SHA-512 signature
 * const isValid512 = await verifyRSA('document', 'signature', publicKey, {
 *   hashAlgorithm: 'SHA-512',
 *   scheme: 'PKCS1',
 * });
 * ```
 *
 * @see {@link signRSA} for RSA signing
 * @see {@link RSAOptions} for available options
 * @see {@link SigningKey} for the accepted key forms
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify} Web Crypto API verify
 */
export const verifyRSA = async (
  data: string | Uint8Array,
  signature: string,
  publicKey: SigningKey,
  options?: RSAOptions,
): Promise<boolean> => {
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';

  if (!['SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-256, SHA-384, or SHA-512',
    );
  }

  if (!signature || typeof signature !== 'string') {
    throw new Error('Signature must be a non-empty string');
  }

  // Scheme selects the RSA signature primitive: RSASSA-PKCS1-v1_5 (RFC 7518
  // `RS*`) or RSASSA-PSS (RFC 7518 `PS*`, the default). Must match signing.
  const scheme = options?.scheme ?? 'PSS';

  // Import the public key, bound to the chosen scheme
  const cryptoKey = await importSigningKey(publicKey, {
    family: 'RSA',
    purpose: 'verify',
    hash: hashAlgorithm,
    scheme,
  });

  // Prepare the data to verify
  const dataToVerify = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Decode the base64 signature
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = Uint8Array.from(
      atob(signature),
      (c) => c.codePointAt(0) ?? 0,
    );
  } catch (error) {
    throw new Error(
      `Invalid signature format. Must be a base64 string: ${error}`,
    );
  }

  // PSS salt length tracks the hash length; PKCS#1 v1.5 takes no salt.
  let saltLength: number;
  if (hashAlgorithm === 'SHA-384') {
    saltLength = 48;
  } else if (hashAlgorithm === 'SHA-512') {
    saltLength = 64;
  } else {
    saltLength = 32;
  }

  // Verify the signature
  return crypto.subtle.verify(
    scheme === 'PKCS1'
      ? { name: 'RSASSA-PKCS1-v1_5' }
      : { name: 'RSA-PSS', saltLength },
    cryptoKey,
    signatureBytes as BufferSource,
    dataToVerify as BufferSource,
  );
};

/**
 * Verifies an ECDSA signature produced by {@link signEC}.
 *
 * ## Only raw `R‖S` is accepted
 *
 * The base64 signature must decode to the fixed-width `R‖S` concatenation of
 * RFC 7515 §3.4 — 64 bytes for P-256, 96 for P-384, 132 for P-521. An
 * ASN.1/DER-encoded signature (what OpenSSL's `dgst -sign` emits) is **not**
 * accepted and returns `false`: a wrong-length signature is not a valid
 * signature for the curve, and treating the two encodings interchangeably would
 * let the same key material be replayed across formats. Convert DER to `R‖S`
 * before calling if you are bridging non-web tooling.
 *
 * Because the signature is attacker-controlled in most real deployments, a
 * malformed one is reported as `false` rather than raised — only a signature
 * that is not valid base64 throws.
 *
 * ## Curve binding
 *
 * `options.curve` pins the curve the key must lie on. A key on a different
 * curve is **rejected outright** rather than merely failing to verify, so
 * "wrong curve" is distinguishable from "bad signature" — this is what lets the
 * JWT layer refuse a P-384 key offered for an `ES256` token.
 *
 * @param {string | Uint8Array} data - The data the signature covers, either as a string or binary data
 * @param {string} signature - The signature to verify: base64 of raw `R‖S`
 * @param {SigningKey} publicKey - The EC public key: a PEM (SPKI) string, an
 *   ECDSA `CryptoKey`, or a public EC JWK
 * @param {ECOptions} [options] - Optional settings: `hashAlgorithm` (default:
 *   the curve's RFC 7518 pairing; must match signing) and `curve` (default:
 *   read from the key)
 * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise
 *
 * @throws {Error} When the supplied key is not an EC key, or lies on a curve
 *   other than `options.curve` when that is set
 * @throws {Error} When the curve is not P-256, P-384 or P-521
 * @throws {Error} When the public key is in invalid PEM format
 * @throws {Error} When the signature is empty or invalid base64
 * @throws {Error} When a supplied `CryptoKey` or JWK is not an ECDSA public
 *   key, or does not permit verification
 *
 * @example
 * ```typescript
 * declare const signature: string;
 *
 * const publicKey = `-----BEGIN PUBLIC KEY-----
 * MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...
 * -----END PUBLIC KEY-----`;
 *
 * const isValid = await verifyEC('important document', signature, publicKey);
 *
 * // Pin the curve: a P-384 key is rejected, not merely reported invalid
 * const pinned = await verifyEC('document', signature, publicKey, {
 *   curve: 'P-256',
 * });
 * ```
 *
 * @see {@link signEC} for ECDSA signing
 * @see {@link ECOptions} for available options
 * @see {@link SigningKey} for the accepted key forms
 * @see {@link https://www.rfc-editor.org/rfc/rfc7515#section-3.4} RFC 7515 §3.4 — `R‖S` encoding
 */
export const verifyEC = async (
  data: string | Uint8Array,
  signature: string,
  publicKey: SigningKey,
  options?: ECOptions,
): Promise<boolean> => {
  if (!signature || typeof signature !== 'string') {
    throw new Error('Signature must be a non-empty string');
  }

  const curve = resolveECCurve(publicKey, options?.curve);
  const hashAlgorithm = options?.hashAlgorithm ?? EC_CURVE_HASH[curve];

  if (!['SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-256, SHA-384, or SHA-512',
    );
  }

  const cryptoKey = await importSigningKey(publicKey, {
    family: 'EC',
    purpose: 'verify',
    hash: hashAlgorithm,
    curve,
  });

  const dataToVerify = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = Uint8Array.from(
      atob(signature),
      (c) => c.codePointAt(0) ?? 0,
    );
  } catch (error) {
    throw new Error(
      `Invalid signature format. Must be a base64 string: ${error}`,
    );
  }

  // RFC 7515 §3.4 fixes the width, so anything else — a DER SEQUENCE, a
  // truncated signature, one from a larger curve — is not a signature for this
  // curve. Checked here rather than left to the runtime so every target agrees
  // on the answer instead of some throwing and some returning false.
  if (signatureBytes.length !== EC_SIGNATURE_BYTES[curve]) {
    return false;
  }

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: hashAlgorithm },
    cryptoKey,
    signatureBytes as BufferSource,
    dataToVerify as BufferSource,
  );
};
