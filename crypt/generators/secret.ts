import { encodeBase64, encodeHex } from '$encoding';

/**
 * Output encoding options for the secret generator.
 *
 * - `HEX`: Hexadecimal encoding (0-9, a-f)
 * - `BASE64`: Base64 encoding (A-Z, a-z, 0-9, +, /)
 * - `ALPHANUMERIC`: Alphanumeric characters (A-Z, a-z, 0-9)
 */
export type SecretEncoding = 'HEX' | 'BASE64' | 'ALPHANUMERIC';

/**
 * Configuration options for secret generation.
 *
 * Provides fine-grained control over secret generation including length,
 * encoding, formatting, and output customization.
 *
 * Note: The byteLength refers to the amount of random data generated, not the
 * final output length. Prefixes and hyphens will add to the total output length.
 */
export type SecretGeneratorOptions = {
  /**
   * Length of the secret in bytes (amount of random data to generate).
   * Must be a positive integer.
   *
   * Note: This controls the entropy, not the final string length.
   * The actual output length depends on encoding:
   * - HEX: byteLength * 2 characters (+ prefix + hyphens)
   * - BASE64: Math.ceil(byteLength * 4/3) characters (+ prefix + hyphens)
   * - ALPHANUMERIC: byteLength characters (+ prefix + hyphens)
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
   * @default 'HEX'
   * @see {@link SecretEncoding} for available options
   */
  encoding?: SecretEncoding;

  /**
   * Whether to force lowercase output.
   * Only applies to string outputs (hex, base64, alphanumeric).
   * @default false
   */
  lowercase?: boolean;
};

/**
 * Generates a cryptographically secure random secret suitable for encryption algorithms.
 *
 * Uses `crypto.getRandomValues()` to generate cryptographically strong random data.
 * Supports multiple output encodings and formatting options for different use cases.
 * Can accept either simple parameters or a comprehensive options object.
 *
 * **Important**: The byteLength parameter controls the amount of random entropy
 * generated, not the final output length. Prefixes and hyphens will add to the
 * total output length.
 *
 * @param {number | SecretGeneratorOptions} byteLengthOrOptions - The length of the secret in bytes or an options object ({@link SecretGeneratorOptions})
 * @param {SecretEncoding} [encoding='hex'] - The encoding to use for the output ({@link SecretEncoding})
 * @param {string} [prefix=''] - An optional prefix to be added to the secret
 * @param {number} [hyphenInterval=0] - The interval at which hyphens should be inserted (0 = no hyphens)
 * @returns {string} The generated secret in the specified encoding
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
 * // Generate with prefix and hyphens - byteLength is still honored
 * const secret = secretGenerator(8, 'hex', 'api-key:', 4);
 * console.log(secret); // "api-key:a1b2-c3d4-e5f6-7890" (8 bytes = 16 hex chars + formatting)
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
  encoding: SecretEncoding = 'HEX',
  prefix = '',
  hyphenInterval = 0,
): string => {
  // Parse options
  let byteLength: number;
  let finalEncoding: SecretEncoding;
  let finalPrefix: string;
  let finalHyphenInterval: number;
  let lowercase = false;

  if (typeof byteLengthOrOptions === 'object') {
    byteLength = byteLengthOrOptions.byteLength;
    finalEncoding = byteLengthOrOptions.encoding ?? 'HEX';
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

  // Generate string in the requested encoding
  let result: string;

  switch (finalEncoding) {
    case 'HEX':
      result = encodeHex(bytes);
      break;

    case 'BASE64':
      result = encodeBase64(bytes);
      break;

    case 'ALPHANUMERIC': {
      // Generate enough characters to represent the byte length
      // Each byte can be represented by 1 alphanumeric character
      result = Array.from(bytes)
        .map((byte) => {
          // Map each byte to alphanumeric range (62 possibilities)
          const mod = byte % 62;
          if (mod < 10) return String.fromCharCode(48 + mod); // 0-9
          if (mod < 36) return String.fromCharCode(65 + mod - 10); // A-Z
          return String.fromCharCode(97 + mod - 36); // a-z
        })
        .join('');
      break;
    }

    default:
      throw new Error(
        'Invalid encoding. Must be "HEX", "BASE64", or "ALPHANUMERIC"',
      );
  }

  // Apply lowercase if requested
  if (lowercase) {
    result = result.toLowerCase();
  }

  // Handle prefix and hyphen formatting
  let formattedResult = result;

  // Add hyphens if needed (but only to the core secret, not the prefix)
  if (finalHyphenInterval > 0) {
    const regex = new RegExp(`.{1,${finalHyphenInterval}}`, 'g');
    formattedResult = result.match(regex)!.join('-');
  }

  // Add prefix
  return `${finalPrefix}${formattedResult}`;
};

/**
 * Generates a cryptographically secure hexadecimal secret.
 *
 * Convenience alias for `secretGenerator` with hex encoding.
 *
 * @param {number} byteLength - The length of the secret in bytes
 * @param {string} [prefix=''] - Optional prefix to add to the secret
 * @param {number} [hyphenInterval=0] - Interval for hyphen insertion (0 = no hyphens)
 * @param {boolean} [lowercase=false] - Whether to force lowercase output
 * @returns {string} Hexadecimal encoded secret
 *
 * @example
 * ```typescript
 * const hexSecret = generateHexSecret(16);
 * console.log(hexSecret); // "a1b2c3d4e5f67890abcdef1234567890"
 * ```
 *
 * @example
 * ```typescript
 * const formattedHex = generateHexSecret(8, 'key-', 4, true);
 * console.log(formattedHex); // "key-a1b2-c3d4-e5f6-7890"
 * ```
 */
export const generateHexSecret = (
  byteLength: number,
  prefix = '',
  hyphenInterval = 0,
  lowercase = false,
): string =>
  secretGenerator({
    byteLength,
    encoding: 'HEX',
    prefix,
    hyphenInterval,
    lowercase,
  });

/**
 * Generates a cryptographically secure base64 secret.
 *
 * Convenience alias for `secretGenerator` with base64 encoding.
 *
 * @param {number} byteLength - The length of the secret in bytes
 * @param {string} [prefix=''] - Optional prefix to add to the secret
 * @param {number} [hyphenInterval=0] - Interval for hyphen insertion (0 = no hyphens)
 * @param {boolean} [lowercase=false] - Whether to force lowercase output
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
 * const apiKey = generateBase64Secret(24, 'sk-', 8);
 * console.log(apiKey); // "sk-aBcDeFgH-iJkLmNoP-qRsTuVwX"
 * ```
 */
export const generateBase64Secret = (
  byteLength: number,
  prefix = '',
  hyphenInterval = 0,
  lowercase = false,
): string =>
  secretGenerator({
    byteLength,
    encoding: 'BASE64',
    prefix,
    hyphenInterval,
    lowercase,
  });

/**
 * Generates a cryptographically secure alphanumeric secret.
 *
 * Convenience alias for `secretGenerator` with alphanumeric encoding.
 * Uses only letters (A-Z, a-z) and numbers (0-9).
 *
 * @param {number} byteLength - The length of the secret in bytes
 * @param {string} [prefix=''] - Optional prefix to add to the secret
 * @param {number} [hyphenInterval=0] - Interval for hyphen insertion (0 = no hyphens)
 * @param {boolean} [lowercase=false] - Whether to force lowercase output
 * @returns {string} Alphanumeric encoded secret
 *
 * @example
 * ```typescript
 * const alphaSecret = generateAlphanumericSecret(12);
 * console.log(alphaSecret); // "aBc123XyZ789"
 * ```
 *
 * @example
 * ```typescript
 * const password = generateAlphanumericSecret(16, '', 4, true);
 * console.log(password); // "abcd-1234-efgh-5678"
 * ```
 */
export const generateAlphanumericSecret = (
  byteLength: number,
  prefix = '',
  hyphenInterval = 0,
  lowercase = false,
): string =>
  secretGenerator({
    byteLength,
    encoding: 'ALPHANUMERIC',
    prefix,
    hyphenInterval,
    lowercase,
  });

/**
 * Generates a simple random token suitable for API keys or session tokens.
 *
 * Uses hex encoding with a default length of 32 bytes (256 bits) for high security.
 *
 * @param {string} [prefix=''] - Optional prefix to add to the token
 * @param {boolean} [lowercase=true] - Whether to use lowercase hex (default: true)
 * @returns {string} A secure random token
 *
 * @example
 * ```typescript
 * const apiKey = generateToken();
 * console.log(apiKey); // "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
 * ```
 *
 * @example
 * ```typescript
 * const sessionToken = generateToken('sess_');
 * console.log(sessionToken); // "sess_a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
 * ```
 */
export const generateToken = (
  prefix = '',
  lowercase = true,
): string =>
  secretGenerator({
    byteLength: 32,
    encoding: 'HEX',
    prefix,
    lowercase,
  });

/**
 * Generates a random password with configurable strength.
 *
 * Uses alphanumeric encoding for better readability in passwords.
 *
 * @param {number} [length=16] - The number of bytes of entropy (affects final length)
 * @param {boolean} [includeHyphens=false] - Whether to add hyphens for readability
 * @returns {string} A random password
 *
 * @example
 * ```typescript
 * const password = generatePassword();
 * console.log(password); // "aBc123XyZ789MnOp"
 * ```
 *
 * @example
 * ```typescript
 * const readablePassword = generatePassword(12, true);
 * console.log(readablePassword); // "aBc1-23Xy-Z789-MnO"
 * ```
 */
export const generatePassword = (
  length = 16,
  includeHyphens = false,
): string =>
  secretGenerator({
    byteLength: length,
    encoding: 'ALPHANUMERIC',
    hyphenInterval: includeHyphens ? 4 : 0,
  });
