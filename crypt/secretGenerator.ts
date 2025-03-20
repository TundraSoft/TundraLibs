import { encodeBase64, encodeHex } from '$encoding';

/**
 * Output encoding options for the secret generator
 */
export type SecretEncoding = 'hex' | 'base64' | 'raw';

/**
 * Generates a cryptographically secure random secret suitable for encryption algorithms.
 *
 * @param {number} byteLength - The length of the secret in bytes (e.g., 16 for AES-128, 32 for AES-256)
 * @param {SecretEncoding} encoding - The encoding to use for the output ('hex', 'base64', or 'raw').
 *                                   Defaults to 'hex'.
 * @param {string} prefix - An optional prefix to be added to the secret. Only applied for string outputs.
 *                         Defaults to an empty string.
 * @returns {string | Uint8Array} The generated secret in the specified encoding (string) or as a Uint8Array if raw.
 *
 * @example
 * // Generate a 32-byte (256-bit) secret in hex format
 * const secret = secretGenerator(32);
 * console.log(secret); // Logs a 64-character hex string (32 bytes)
 *
 * @example
 * // Generate a 16-byte (128-bit) secret in base64 format
 * const secret = secretGenerator(16, 'base64');
 * console.log(secret); // Logs a base64-encoded string
 *
 * @example
 * // Generate a 24-byte (192-bit) secret as raw bytes
 * const secret = secretGenerator(24, 'raw');
 * console.log(secret); // Logs a Uint8Array of 24 bytes
 *
 * @example
 * // Generate a secret with a prefix
 * const secret = secretGenerator(32, 'hex', 'key:');
 * console.log(secret); // Logs a prefixed hex string
 */
export const secretGenerator = (
  byteLength: number,
  encoding: SecretEncoding = 'hex',
  prefix = '',
): string | Uint8Array => {
  // Validate input
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error('byteLength must be a positive integer');
  }

  // Generate random bytes
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));

  // Return in the requested format
  switch (encoding) {
    case 'hex':
      return `${prefix}${encodeHex(bytes)}`;

    case 'base64':
      return `${prefix}${encodeBase64(bytes)}`;

    case 'raw':
      // For raw format, we ignore the prefix as it doesn't make sense to prepend a string to binary data
      if (prefix) {
        console.warn('Prefix is ignored when using raw encoding');
      }
      return bytes;

    default:
      throw new Error('Invalid encoding. Must be "hex", "base64", or "raw"');
  }
};
