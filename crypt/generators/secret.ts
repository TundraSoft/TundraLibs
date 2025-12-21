import { encodeBase32, encodeBase64, encodeHex } from '$encoding';

/**
 * Output encoding options for the secret generator.
 *
 * - `HEX`: Hexadecimal encoding (0-9, a-f)
 * - `BASE64`: Base64 encoding (A-Z, a-z, 0-9, +, /)
 * - `BASE32`: Base32 encoding (A-Z, 2-7)
 * - `ALPHANUMERIC`: Alphanumeric characters (A-Z, a-z, 0-9)
 */
export type SecretEncoding = 'HEX' | 'BASE64' | 'BASE32' | 'ALPHANUMERIC';

/**
 * Configuration options for secret generation.
 *
 * Controls the amount of entropy and output encoding format.
 */
export type SecretGeneratorOptions = {
  /**
   * Length of the secret in bytes (amount of random data to generate).
   * Must be a positive integer.
   *
   * The output length depends on encoding:
   * - HEX: byteLength * 2 characters
   * - BASE64: Math.ceil(byteLength * 4/3) characters
   * - BASE32: Math.ceil(byteLength * 8/5) characters
   * - ALPHANUMERIC: byteLength characters
   */
  byteLength: number;

  /**
   * Encoding to use for the output.
   * @default 'HEX'
   * @see {@link SecretEncoding} for available options
   */
  encoding?: SecretEncoding;
};

/**
 * Generates a cryptographically secure random secret.
 *
 * Uses `crypto.getRandomValues()` to generate cryptographically strong random data.
 * Supports multiple output encodings for different use cases.
 *
 * @param {number | SecretGeneratorOptions} byteLengthOrOptions - The length of the secret in bytes or an options object
 * @param {SecretEncoding} [encoding='HEX'] - The encoding to use for the output
 * @returns {string} The generated secret in the specified encoding
 *
 * @throws {Error} When byteLength is not a positive integer
 * @throws {Error} When encoding is not supported
 *
 * @example
 * ```typescript
 * // Generate a 32-byte (256-bit) hex secret
 * const secret = secretGenerator(32);
 * console.log(secret); // "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
 * ```
 *
 * @example
 * ```typescript
 * // Generate a 20-byte base32 secret for TOTP
 * const totpSecret = secretGenerator(20, 'BASE32');
 * console.log(totpSecret); // "JBSWY3DPEBLW64TMMQQQ===="
 * ```
 *
 * @example
 * ```typescript
 * // Generate using options object
 * const secret = secretGenerator({
 *   byteLength: 16,
 *   encoding: 'BASE64'
 * });
 * console.log(secret); // "aBcDeFgHiJkLmNoPqRsTuV=="
 * ```
 *
 * @see {@link SecretEncoding} for encoding options
 * @see {@link SecretGeneratorOptions} for detailed configuration
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues} Web Crypto API getRandomValues
 */
export const secretGenerator = (
  byteLengthOrOptions: number | SecretGeneratorOptions,
  encoding: SecretEncoding = 'HEX',
): string => {
  // Parse options
  let byteLength: number;
  let finalEncoding: SecretEncoding;

  if (typeof byteLengthOrOptions === 'object') {
    byteLength = byteLengthOrOptions.byteLength;
    finalEncoding = byteLengthOrOptions.encoding ?? 'HEX';
  } else {
    byteLength = byteLengthOrOptions;
    finalEncoding = encoding;
  }

  // Validate input
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error('byteLength must be a positive integer');
  }

  // Generate random bytes
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));

  // Generate string in the requested encoding
  switch (finalEncoding) {
    case 'HEX':
      return encodeHex(bytes);

    case 'BASE64':
      return encodeBase64(bytes);

    case 'BASE32':
      return encodeBase32(bytes);

    case 'ALPHANUMERIC':
      // Map each byte to alphanumeric range (62 possibilities: 0-9, A-Z, a-z)
      return Array.from(bytes)
        .map((byte) => {
          const mod = byte % 62;
          if (mod < 10) return String.fromCodePoint(48 + mod); // 0-9
          if (mod < 36) return String.fromCodePoint(65 + mod - 10); // A-Z
          return String.fromCodePoint(97 + mod - 36); // a-z
        })
        .join('');

    default:
      throw new Error(
        'Invalid encoding. Must be "HEX", "BASE64", "BASE32", or "ALPHANUMERIC"',
      );
  }
};

/**
 * Generates a cryptographically secure hexadecimal secret.
 *
 * Convenience alias for `secretGenerator` with HEX encoding.
 * Output length will be byteLength * 2 characters.
 *
 * @param {number} byteLength - The length of the secret in bytes
 * @returns {string} Hexadecimal encoded secret (lowercase)
 *
 * @example
 * ```typescript
 * const hexSecret = generateHexSecret(16);
 * console.log(hexSecret); // "a1b2c3d4e5f67890abcdef1234567890" (32 chars)
 * ```
 *
 * @example
 * ```typescript
 * // For 256-bit encryption key
 * const encryptionKey = generateHexSecret(32);
 * ```
 */
export const generateHexSecret = (byteLength: number): string =>
  secretGenerator(byteLength, 'HEX');

/**
 * Generates a cryptographically secure base64 secret.
 *
 * Convenience alias for `secretGenerator` with BASE64 encoding.
 * More compact than hex encoding.
 *
 * @param {number} byteLength - The length of the secret in bytes
 * @returns {string} Base64 encoded secret
 *
 * @example
 * ```typescript
 * const b64Secret = generateBase64Secret(16);
 * console.log(b64Secret); // "aBcDeFgHiJkLmNoPqRsTuV=="
 * ```
 *
 * @example
 * ```typescript
 * // For API keys or tokens
 * const apiKey = generateBase64Secret(24);
 * ```
 */
export const generateBase64Secret = (byteLength: number): string =>
  secretGenerator(byteLength, 'BASE64');

/**
 * Generates a cryptographically secure base32 secret.
 *
 * Convenience alias for `secretGenerator` with BASE32 encoding.
 * Uses RFC 4648 Base32 alphabet (A-Z, 2-7). Ideal for TOTP/OTP secrets.
 *
 * @param {number} byteLength - The length of the secret in bytes
 * @returns {string} Base32 encoded secret (uppercase)
 *
 * @example
 * ```typescript
 * const b32Secret = generateBase32Secret(16);
 * console.log(b32Secret); // "JBSWY3DPEBLW64TMMQQQ===="
 * ```
 *
 * @example
 * ```typescript
 * // For TOTP (Time-based One-Time Password)
 * const totpSecret = generateBase32Secret(20);
 * ```
 */
export const generateBase32Secret = (byteLength: number): string =>
  secretGenerator(byteLength, 'BASE32');

/**
 * Generates a cryptographically secure alphanumeric secret.
 *
 * Convenience alias for `secretGenerator` with ALPHANUMERIC encoding.
 * Uses only letters (A-Z, a-z) and numbers (0-9).
 * Output length equals byteLength.
 *
 * @param {number} byteLength - The length of the secret in bytes (and characters)
 * @returns {string} Alphanumeric encoded secret
 *
 * @example
 * ```typescript
 * const alphaSecret = generateAlphanumericSecret(12);
 * console.log(alphaSecret); // "aBc123XyZ789" (12 chars)
 * ```
 *
 * @example
 * ```typescript
 * // For human-friendly passwords or codes
 * const code = generateAlphanumericSecret(16);
 * ```
 */
export const generateAlphanumericSecret = (byteLength: number): string =>
  secretGenerator(byteLength, 'ALPHANUMERIC');

/**
 * Generates a secure random token suitable for API keys or session tokens.
 *
 * Uses HEX encoding with 32 bytes (256 bits) for high security.
 * Output is 64 hexadecimal characters.
 *
 * @returns {string} A 64-character hexadecimal token
 *
 * @example
 * ```typescript
 * const apiKey = generateToken();
 * console.log(apiKey); // "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
 * ```
 *
 * @example
 * ```typescript
 * // For session tokens, API keys, etc.
 * const sessionToken = generateToken();
 * ```
 */
export const generateToken = (): string => secretGenerator(32, 'HEX');

/**
 * Generates a random alphanumeric password.
 *
 * Uses ALPHANUMERIC encoding for readability.
 * Contains mixed case letters (A-Z, a-z) and numbers (0-9).
 *
 * @param {number} [length=16] - The length of the password in characters
 * @returns {string} A random alphanumeric password
 *
 * @example
 * ```typescript
 * const password = generatePassword();
 * console.log(password); // "aBc123XyZ789MnOp" (16 chars)
 * ```
 *
 * @example
 * ```typescript
 * // Generate a 24-character password
 * const strongPassword = generatePassword(24);
 * ```
 */
export const generatePassword = (length = 16): string =>
  secretGenerator(length, 'ALPHANUMERIC');
