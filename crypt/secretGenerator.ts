import { encodeBase64, encodeHex } from '$encoding';

/**
 * Output encoding options for the secret generator.
 *
 * - `hex`: Hexadecimal encoding (0-9, a-f)
 * - `base64`: Base64 encoding (A-Z, a-z, 0-9, +, /)
 * - `raw`: Raw binary data as Uint8Array
 * - `alphanumeric`: Alphanumeric characters (A-Z, a-z, 0-9)
 */
export type SecretEncoding = 'hex' | 'base64' | 'raw' | 'alphanumeric';

/**
 * Configuration options for secret generation.
 *
 * Provides fine-grained control over secret generation including length,
 * encoding, formatting, and output customization.
 */
export interface SecretGeneratorOptions {
  /**
   * Length of the secret in bytes.
   * Must be a positive integer.
   */
  byteLength: number;

  /**
   * Optional prefix to add to the secret.
   * Only applied for string outputs (ignored for raw encoding).
   * @default ''
   */
  prefix?: string;

  /**
   * Interval at which to insert hyphens for readability.
   * Set to 0 to disable hyphen insertion.
   * @default 0 (no hyphens)
   */
  hyphenInterval?: number;

  /**
   * Encoding to use for the output.
   * @default 'hex'
   * @see {@link SecretEncoding} for available options
   */
  encoding?: SecretEncoding;

  /**
   * Whether to force lowercase output.
   * Only applies to string outputs (hex, base64, alphanumeric).
   * @default false
   */
  lowercase?: boolean;
}

/**
 * Generates a cryptographically secure random secret suitable for encryption algorithms.
 *
 * Uses `crypto.getRandomValues()` to generate cryptographically strong random data.
 * Supports multiple output encodings and formatting options for different use cases.
 * Can accept either simple parameters or a comprehensive options object.
 *
 * @param {number | SecretGeneratorOptions} byteLengthOrOptions - The length of the secret in bytes or an options object ({@link SecretGeneratorOptions})
 * @param {SecretEncoding} [encoding='hex'] - The encoding to use for the output ({@link SecretEncoding})
 * @param {string} [prefix=''] - An optional prefix to be added to the secret (ignored for raw encoding)
 * @param {number} [hyphenInterval=0] - The interval at which hyphens should be inserted (0 = no hyphens)
 * @returns {string | Uint8Array} The generated secret in the specified encoding (string) or as a Uint8Array if raw
 *
 * @throws {Error} When byteLength is not a positive integer
 * @throws {Error} When hyphenInterval is not a non-negative integer
 * @throws {Error} When encoding is not supported
 *
 * @example
 * ```typescript
 * // Generate a 32-byte (256-bit) secret in hex format
 * const secret = secretGenerator(32);
 * console.log(secret); // "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
 * ```
 *
 * @example
 * ```typescript
 * // Generate a 16-byte secret in base64 format
 * const secret = secretGenerator(16, 'base64');
 * console.log(secret); // "aBcDeFgHiJkLmNoPqRsTuV=="
 * ```
 *
 * @example
 * ```typescript
 * // Generate raw binary data
 * const secret = secretGenerator(24, 'raw');
 * console.log(secret); // Uint8Array(24) [...]
 * ```
 *
 * @example
 * ```typescript
 * // Generate with prefix and hyphens
 * const secret = secretGenerator(16, 'hex', 'api-key:', 4);
 * console.log(secret); // "api-key:a1b2-c3d4-e5f6-7890-1234-5678-9abc-def0"
 * ```
 *
 * @example
 * ```typescript
 * // Generate using options object
 * const secret = secretGenerator({
 *   byteLength: 16,
 *   encoding: 'alphanumeric',
 *   prefix: 'key-',
 *   hyphenInterval: 4,
 *   lowercase: true
 * });
 * console.log(secret); // "key-ab1c-d2e3-f4g5-h6i7"
 * ```
 *
 * @see {@link SecretEncoding} for encoding options
 * @see {@link SecretGeneratorOptions} for detailed configuration
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues} Web Crypto API getRandomValues
 */
export const secretGenerator = (
  byteLengthOrOptions: number | SecretGeneratorOptions,
  encoding: SecretEncoding = 'hex',
  prefix = '',
  hyphenInterval = 0,
): string | Uint8Array => {
  // Parse options
  let byteLength: number;
  let finalEncoding: SecretEncoding;
  let finalPrefix: string;
  let finalHyphenInterval: number;
  let lowercase = false;

  if (typeof byteLengthOrOptions === 'object') {
    byteLength = byteLengthOrOptions.byteLength;
    finalEncoding = byteLengthOrOptions.encoding ?? 'hex';
    finalPrefix = byteLengthOrOptions.prefix ?? '';
    finalHyphenInterval = byteLengthOrOptions.hyphenInterval ?? 0;
    lowercase = byteLengthOrOptions.lowercase ?? false;
  } else {
    byteLength = byteLengthOrOptions;
    finalEncoding = encoding;
    finalPrefix = prefix;
    finalHyphenInterval = hyphenInterval;
  }

  // Validate input
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error('byteLength must be a positive integer');
  }

  if (
    finalHyphenInterval < 0 ||
    (finalHyphenInterval > 0 && !Number.isInteger(finalHyphenInterval))
  ) {
    throw new Error('hyphenInterval must be a non-negative integer');
  }

  // Generate random bytes
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));

  // Return in the requested format
  let result: string;

  switch (finalEncoding) {
    case 'hex':
      result = encodeHex(bytes);
      break;

    case 'base64':
      result = encodeBase64(bytes);
      break;

    case 'alphanumeric':
      // Convert to alphanumeric characters (0-9, a-z, A-Z)
      result = Array.from(bytes)
        .map((byte) => {
          // Map each byte to alphanumeric range
          const mod = byte % 62;
          if (mod < 10) return String.fromCharCode(48 + mod); // 0-9
          if (mod < 36) return String.fromCharCode(65 + mod - 10); // A-Z
          return String.fromCharCode(97 + mod - 36); // a-z
        })
        .join('');
      // Trim to the length that would be generated by the number of bytes
      // For alphanumeric, 1 byte = ~1.5 chars on average, so to be safe we ensure
      // we generate enough bytes and then trim
      result = result.slice(0, byteLength * 2);
      break;

    case 'raw':
      // For raw format, we ignore the prefix and hyphen formatting
      if (finalPrefix || finalHyphenInterval) {
        console.warn(
          'Prefix and hyphenInterval are ignored when using raw encoding',
        );
      }
      return bytes;

    default:
      throw new Error(
        'Invalid encoding. Must be "hex", "base64", "alphanumeric", or "raw"',
      );
  }

  // Apply lowercase if requested
  if (lowercase) {
    result = result.toLowerCase();
  }

  // Add hyphens if needed
  if (finalHyphenInterval > 0) {
    const regex = new RegExp(`.{1,${finalHyphenInterval}}`, 'g');
    result = result.match(regex)!.join('-');
  }

  // Add prefix
  return `${finalPrefix}${result}`;
};
