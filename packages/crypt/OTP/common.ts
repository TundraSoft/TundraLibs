/**
 * @fileoverview Common OTP utilities and types.
 *
 * Shared functions and type definitions for HOTP and TOTP implementations,
 * including OTP generation, validation, and otpauth:// URL creation.
 *
 * @module
 * @internal
 */

import type { DigestAlgorithms } from '../digest/mod.ts';
import { sprintf } from '@std/fmt/printf';
import { decodeBase32, encodeBase32 } from '@std/encoding';

/**
 * Options for HOTP generation
 */
export type HOTPOptions = {
  /**
   * The length of the OTP
   * @default 6
   */
  length?: number;

  /**
   * The hash algorithm to use. Defaults to `'SHA-1'`, the RFC 4226/6238
   * interop default that authenticator apps assume.
   * @default 'SHA-1'
   */
  algo?: DigestAlgorithms;
};

/**
 * Options for TOTP generation
 */
export type TOTPOptions = {
  /**
   * The epoch time in milliseconds
   * @default Date.now()
   */
  epoch?: number;

  /**
   * The time period in seconds
   * @default 30
   */
  period?: number;

  /**
   * The length of the OTP
   * @default 6
   */
  length?: number;

  /**
   * The hash algorithm to use. Defaults to `'SHA-1'`, the RFC 4226/6238
   * interop default that authenticator apps assume.
   * @default 'SHA-1'
   */
  algo?: DigestAlgorithms;
};

/**
 * Options for TOTP verification
 */
export type TOTPVerifyOptions = {
  /**
   * The number of time steps to check before and after the current one
   * @default 1
   */
  window?: number;

  /**
   * The epoch time in milliseconds
   * @default Date.now()
   */
  epoch?: number;

  /**
   * The time period in seconds
   * @default 30
   */
  period?: number;

  /**
   * The length of the OTP
   * @default 6
   */
  length?: number;

  /**
   * The hash algorithm to use. Defaults to `'SHA-1'`, the RFC 4226/6238
   * interop default that authenticator apps assume.
   * @default 'SHA-1'
   */
  algo?: DigestAlgorithms;
};

/**
 * Converts a number to an 8-byte array (Uint8Array).
 *
 * @param {number} data - The number to convert.
 * @returns {Uint8Array} The resulting 8-byte array.
 * @throws {Error} If the number is not a non-negative integer.
 */
export const numberToBytes = (data: number): Uint8Array => {
  if (!Number.isInteger(data) || data < 0) {
    throw new Error('Counter must be a non-negative integer');
  }

  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(data), false); // false for big-endian
  return new Uint8Array(buffer) as Uint8Array;
};

/**
 * Validates input parameters for OTP generation
 *
 * @param {string} key - The secret key (Base32 string or UTF-8 string)
 * @param {number} counter - The counter value
 * @param {number} length - The length of the OTP
 * @param {DigestAlgorithms} algo - The hash algorithm to use
 * @throws {Error} If any input is invalid
 */
export const validateInputs = (
  key: string,
  counter: number,
  length: number,
  algo: DigestAlgorithms,
): void => {
  // Validate key
  if (!key || key.length < 16) {
    throw new Error('Secret key should be at least 16 characters long');
  }

  // Validate counter
  if (!Number.isInteger(counter) || counter < 0) {
    throw new Error('Counter must be a non-negative integer');
  }

  // Validate OTP length
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('OTP length must be a non-negative integer');
  }

  // Validate algorithm
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algo)) {
    throw new Error('The provided algorithm name is not supported');
  }
};

/**
 * Derives the raw HMAC key bytes from an OTP secret string, applying the single
 * base32-vs-UTF8 rule shared by {@link generate} (and thus generateTOTP /
 * verifyTOTP / generateHOTP / verifyHOTP) and {@link generateOTPAuthURL}, so
 * all of them agree on what "the key" is.
 *
 * A secret that is a *valid* RFC 4648 base32 string (`A-Z`, `2-7`, optional `=`
 * padding, and a decodable length) is base32-decoded; anything else — a
 * lower-case base32 string, a space-grouped one, or a raw passphrase — is taken
 * as its UTF-8 bytes. The detection is intentionally case-sensitive: base32 is
 * upper-case, so a lower-case string is treated as a passphrase rather than
 * mis-cased base32, and the URL builder must encode exactly these bytes or an
 * authenticator's codes would never verify. Note that matching the base32
 * alphabet is not sufficient: an all-upper-case passphrase whose length is not a
 * valid base32 length (remainder 1, 3 or 6 mod 8) is not decodable and is
 * likewise treated as UTF-8 rather than raising a base32-decode error.
 *
 * @param key - The OTP secret string.
 * @returns The HMAC key bytes.
 * @internal
 */
export const secretToKeyBytes = (key: string): Uint8Array => {
  // A secret matching the RFC 4648 base32 alphabet (A-Z, 2-7, optional `=`
  // padding) is decoded to its raw bytes. But matching the alphabet is NOT the
  // same as being a decodable base32 string: a base32 quantum only ever holds
  // 2, 4, 5 or 7 significant chars, so only lengths whose remainder mod 8 is 0,
  // 2, 4, 5 or 7 decode. An all-uppercase passphrase whose (unpadded) length is
  // ≡ 1, 3 or 6 (mod 8) — e.g. a 19-char string — matches the alphabet yet is
  // not valid base32. Rather than let @std/encoding throw a raw RangeError, fall
  // back to treating such a string as UTF-8 bytes: the same handling every other
  // non-base32 secret (lower-case, spaces, symbols) already receives. This keeps
  // generateOTPAuthURL consistent with generate()/verifyTOTP and preserves the
  // friendly-error contract instead of leaking a dependency-level failure.
  if (/^[A-Z2-7]+=*$/.test(key)) {
    const core = key.replace(/=+$/, '');
    const remainder = core.length % 8;
    if (remainder !== 1 && remainder !== 3 && remainder !== 6) {
      // Base32 decode (normalise padding to a full final quantum).
      const paddedKey = core + '='.repeat((8 - remainder) % 8);
      return decodeBase32(paddedKey);
    }
  }
  // Treat as UTF-8 string (backwards compatibility)
  return new TextEncoder().encode(key);
};

/**
 * Generates a one-time password (OTP) using HMAC-based algorithm.
 *
 * Implements the algorithm described in RFC 4226 (HOTP) and RFC 6238 (TOTP).
 * Uses dynamic truncation to extract a numeric code from the HMAC digest.
 * This is an internal function used by both {@link HOTP} and {@link TOTP}.
 *
 * @param {string} key - The secret key (Base32 string or UTF-8 string, minimum 16 characters)
 * @param {number} counter - The counter value (non-negative integer)
 * @param {number} [length=6] - The length of the OTP (positive integer)
 * @param {DigestAlgorithms} [algo='SHA-1'] - The hash algorithm to use ({@link DigestAlgorithms});
 *   defaults to `'SHA-1'`, the RFC 4226/6238 interop default and the algorithm
 *   authenticator apps assume when an otpauth URL carries no explicit one
 * @returns {Promise<string>} A promise that resolves to the generated OTP (zero-padded)
 *
 * @throws {Error} When the secret key is shorter than 16 characters
 * @throws {Error} When the counter is not a non-negative integer
 * @throws {Error} When the OTP length is not a positive integer
 * @throws {Error} When the algorithm is not supported
 * @throws {Error} When OTP generation fails
 *
 * @example
 * ```typescript
 * // Generate a 6-digit HOTP with Base32 secret
 * const otp = await generate('JBSWY3DPEHPK3PXP', 0, 6, 'SHA-1');
 * console.log(otp); // "755224"
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc4226} RFC 4226 - HOTP
 * @see {@link https://tools.ietf.org/html/rfc6238} RFC 6238 - TOTP
 * @see {@link DigestAlgorithms} for supported algorithms
 */
export const generate = async (
  key: string,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-1',
): Promise<string> => {
  // Validate inputs
  validateInputs(key, counter, length, algo);

  // Prepare key for HMAC — same base32-vs-UTF8 rule the otpauth URL builder
  // uses, so a QR code and this generator never disagree about the key.
  const keyData = secretToKeyBytes(key);

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData as BufferSource,
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  );

  // Generate HMAC
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      numberToBytes(counter) as BufferSource,
    ),
  );

  // Extract code using dynamic truncation (RFC 4226 section 5.4)
  const offset = (digest[digest.byteLength - 1] ?? 0) & 0x0f;
  const code = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
    .getUint32(offset) & 0x7fffffff;

  // Generate code modulo 10^length and pad with leading zeros if needed
  const op = (code % 10 ** length).toString();
  return sprintf('%0' + length + 's', op);
};

/**
 * Compares two OTP code strings in constant time.
 *
 * Using `===` (or any byte-by-byte compare that short-circuits on the first
 * mismatch) leaks timing information about how many leading characters of a
 * candidate code were correct, which an attacker can exploit to recover the
 * expected code one digit at a time. This helper always inspects every
 * character of the longer string, accumulating differences with a bitwise OR
 * so the running time depends only on the input lengths, not on their
 * contents.
 *
 * Both arguments are expected to be the fixed-length, zero-padded codes
 * produced by {@link generate}; a length mismatch returns `false` (after
 * still scanning every character).
 *
 * @param {string} a - First OTP code.
 * @param {string} b - Second OTP code.
 * @returns {boolean} `true` only when the codes are identical.
 */
export const constantTimeEqual = (a: string, b: string): boolean => {
  const length = Math.max(a.length, b.length);
  // A length difference alone must make the result false, but we still scan
  // the full length so the timing does not reveal where they diverge.
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
};

/**
 * OTP type for otpauth URL generation
 */
export type OTPType = 'totp' | 'hotp';

/**
 * Options for generating an otpauth URL
 */
export type OTPAuthURLOptions = {
  /**
   * The type of OTP (TOTP or HOTP)
   */
  type: OTPType;

  /**
   * The OTP secret, interpreted exactly as `generateTOTP`/`verifyTOTP`
   * interpret it: a *valid* upper-case RFC 4648 base32 string (`A-Z`, `2-7`, of
   * a decodable length) is base32-decoded and used as the key, while anything
   * else — a raw passphrase (including an all upper-case one whose length is not
   * a valid base32 length), or a lower-case/space-grouped string — is treated as
   * UTF-8 bytes. The resulting key bytes are then re-encoded to base32 for the
   * URL.
   *
   * Because of that re-encode the URL secret is byte-identical to the input only
   * when the input is *canonical* base32. A length that is a multiple of 8
   * (whole 40-bit groups) always round-trips unchanged, but a shorter decodable
   * length (remainder 2, 4, 5 or 7 mod 8) leaves unused trailing bits in its
   * final character; if a secret sets those bits (non-canonical) the decode
   * drops them and the re-encode normalises the last character, so it changes
   * (e.g. `BASE32SECRET` becomes `BASE32SECREQ`). Either way the emitted URL
   * secret base32-decodes to the same key the OTP engine HMACs, so an
   * authenticator that scans it produces codes `verifyTOTP` accepts.
   */
  secret: string;

  /**
   * The account name (usually email or username)
   */
  accountName: string;

  /**
   * The issuer/app name (e.g., "MyApp", "GitHub")
   */
  issuer: string;

  /**
   * Hash algorithm to use
   * @default 'SHA-1'
   */
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

  /**
   * Number of digits in the OTP
   * @default 6
   */
  digits?: number;

  /**
   * Time period in seconds (TOTP only)
   * @default 30
   */
  period?: number;

  /**
   * Initial counter value (HOTP only)
   * @default 0
   */
  counter?: number;
};

/**
 * Generates an otpauth:// URL for use with authenticator apps.
 *
 * Creates URLs compatible with Google Authenticator, Authy, and other
 * TOTP/HOTP authenticator applications. The URL can be encoded as a QR code
 * for easy scanning.
 *
 * @param {OTPAuthURLOptions} options - Configuration options for the URL
 * @returns {string} The otpauth:// URL
 *
 * @throws {Error} When required parameters are missing
 * @throws {Error} When algorithm is not supported
 * @throws {Error} When digits is not between 6 and 8
 * @throws {Error} When period is less than 1 (for TOTP)
 * @throws {Error} When counter is negative (for HOTP)
 *
 * @example
 * ```typescript
 * // Generate a TOTP URL
 * const url = generateOTPAuthURL({
 *   type: 'totp',
 *   secret: 'JBSWY3DPEHPK3PXP',
 *   accountName: 'user@example.com',
 *   issuer: 'MyApp',
 *   algorithm: 'SHA-1',
 *   digits: 6,
 *   period: 30
 * });
 * console.log(url);
 * // "otpauth://totp/MyApp:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp&algorithm=SHA1&digits=6&period=30"
 * ```
 *
 * @example
 * ```typescript
 * // Generate an HOTP URL
 * const url = generateOTPAuthURL({
 *   type: 'hotp',
 *   secret: 'JBSWY3DPEHPK3PXP',
 *   accountName: 'user@example.com',
 *   issuer: 'MyApp',
 *   counter: 0
 * });
 * ```
 *
 * @see {@link https://github.com/google/google-authenticator/wiki/Key-Uri-Format} Key URI Format
 */
export const generateOTPAuthURL = (options: OTPAuthURLOptions): string => {
  const {
    type,
    secret,
    accountName,
    issuer,
    algorithm = 'SHA-1',
    digits = 6,
    period = 30,
    counter = 0,
  } = options;

  // Validate required parameters
  if (!type || !['totp', 'hotp'].includes(type)) {
    throw new Error('Type must be either "totp" or "hotp"');
  }

  if (!secret || secret.length === 0) {
    throw new Error('Secret is required and cannot be empty');
  }

  if (!accountName || accountName.length === 0) {
    throw new Error('Account name is required and cannot be empty');
  }

  if (!issuer || issuer.length === 0) {
    throw new Error('Issuer is required and cannot be empty');
  }

  // Validate algorithm
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algorithm)) {
    throw new Error(
      'Algorithm must be one of: SHA-1, SHA-256, SHA-384, SHA-512',
    );
  }

  // Validate digits
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new Error('Digits must be an integer between 6 and 8');
  }

  // Validate type-specific parameters
  if (type === 'totp') {
    if (!Number.isInteger(period) || period < 1) {
      throw new Error('Period must be a positive integer (at least 1)');
    }
  } else if (!Number.isInteger(counter) || counter < 0) {
    throw new Error('Counter must be a non-negative integer');
  }

  // Build the label (issuer:accountName)
  const label = `${encodeURIComponent(issuer)}:${
    encodeURIComponent(accountName)
  }`;

  // Convert algorithm name to the format expected in URLs (remove hyphen)
  const algoParam = algorithm.replace('-', '');

  // Encode the EXACT key bytes the OTP engine will HMAC, then base32-encode
  // them for the URL (authenticator apps require base32). Using the shared
  // `secretToKeyBytes` guarantees the QR code and generate()/verifyTOTP derive
  // the identical key: a canonical upper-case base32 secret round-trips
  // unchanged (a non-canonical one — a valid decodable length but with non-zero
  // unused trailing bits — decodes to the same key bytes and is re-encoded to
  // its canonical form, so its final character may change), while a
  // lower-case/space-grouped secret or a raw passphrase — which the engine
  // treats as UTF-8 — is base32-encoded from those same UTF-8 bytes rather than
  // blindly uppercased into a different key. Padding is stripped, matching the
  // Key-Uri format convention.
  const urlSecret = encodeBase32(secretToKeyBytes(secret)).replace(/=+$/, '');

  // Build query parameters
  const params = new URLSearchParams({
    secret: urlSecret,
    issuer: issuer,
    algorithm: algoParam,
    digits: digits.toString(),
  });

  // Add type-specific parameters
  if (type === 'totp') {
    params.append('period', period.toString());
  } else {
    params.append('counter', counter.toString());
  }

  // Build the final URL
  return `otpauth://${type}/${label}?${params.toString()}`;
};
