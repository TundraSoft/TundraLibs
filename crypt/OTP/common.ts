import type { DigestAlgorithms } from '../digest/mod.ts';
import { sprintf } from '$fmt/printf';
import { decodeBase32 } from '$encoding';

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
   * The hash algorithm to use
   * @default 'SHA-256'
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
   * The hash algorithm to use
   * @default 'SHA-256'
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
   * The hash algorithm to use
   * @default 'SHA-256'
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
 * Generates a one-time password (OTP) using HMAC-based algorithm.
 *
 * Implements the algorithm described in RFC 4226 (HOTP) and RFC 6238 (TOTP).
 * Uses dynamic truncation to extract a numeric code from the HMAC digest.
 * This is an internal function used by both {@link HOTP} and {@link TOTP}.
 *
 * @param {string} key - The secret key (Base32 string or UTF-8 string, minimum 16 characters)
 * @param {number} counter - The counter value (non-negative integer)
 * @param {number} [length=6] - The length of the OTP (positive integer)
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use ({@link DigestAlgorithms})
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
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => {
  // Validate inputs
  validateInputs(key, counter, length, algo);

  // Prepare key for HMAC
  let keyData: Uint8Array;

  // Check if it looks like a Base32 string (only uppercase letters A-Z and digits 2-7)
  const isBase32 = /^[A-Z2-7]+=*$/.test(key);

  if (isBase32) {
    // Base32 decode (add padding if needed)
    const paddedKey = key + '='.repeat((8 - (key.length % 8)) % 8);
    keyData = decodeBase32(paddedKey);
  } else {
    // Treat as UTF-8 string (backwards compatibility)
    keyData = new TextEncoder().encode(key);
  }

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
   * The secret key (will be base32 encoded if it's a string)
   * If already base32 encoded, pass as string
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
  } else {
    if (!Number.isInteger(counter) || counter < 0) {
      throw new Error('Counter must be a non-negative integer');
    }
  }

  // Build the label (issuer:accountName)
  const label = `${encodeURIComponent(issuer)}:${
    encodeURIComponent(accountName)
  }`;

  // Convert algorithm name to the format expected in URLs (remove hyphen)
  const algoParam = algorithm.replace('-', '');

  // Build query parameters
  const params = new URLSearchParams({
    secret: secret.toUpperCase().replace(/\s/g, ''), // Remove spaces and uppercase
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
