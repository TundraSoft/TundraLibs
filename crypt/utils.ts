/**
 * Validates if a secret key meets the minimum length requirement for a given bit length.
 *
 * Checks if the UTF-8 encoded byte length of the secret key is sufficient for the
 * specified bit length requirement. This is useful for ensuring key strength
 * before cryptographic operations.
 *
 * @param {string} secret - The secret key to validate (UTF-8 string)
 * @param {number} bitLength - The required bit length (must be divisible by 8)
 * @returns {boolean} True if the key meets the minimum length requirement, false otherwise
 *
 * @example
 * ```typescript
 * // Check if key is sufficient for 256-bit operations
 * const isValid = validateKey('mySecretKey123456789012345678901234', 256);
 * console.log(isValid); // true (32+ characters for 256 bits)
 * ```
 *
 * @example
 * ```typescript
 * // Check insufficient key length
 * const isValid = validateKey('short', 128);
 * console.log(isValid); // false (needs 16+ characters for 128 bits)
 * ```
 *
 * @see {@link deriveKey} for key length adjustment
 */
export const validateKey = (
  secret: string,
  bitLength: number,
): boolean => {
  const secretBytes = new TextEncoder().encode(secret);
  const requiredBytes = bitLength / 8;

  return secretBytes.length >= requiredBytes;
};

/**
 * Derives a key of the exact required length from a secret string.
 *
 * Converts the secret to UTF-8 bytes and either truncates or pads with zeros
 * to match the exact required length. This ensures consistent key sizes for
 * cryptographic operations that require fixed-length keys.
 *
 * @param {string} secret - The input secret string (UTF-8)
 * @param {number} requiredBytes - The required number of bytes for the output key
 * @returns {Uint8Array} A byte array of exactly the required length
 *
 * @example
 * ```typescript
 * // Derive a 32-byte key from a longer secret
 * const key = deriveKey('myVeryLongSecretKey123456789012345678901234567890', 32);
 * console.log(key.length); // 32
 * ```
 *
 * @example
 * ```typescript
 * // Derive a 16-byte key from a shorter secret (padded with zeros)
 * const key = deriveKey('short', 16);
 * console.log(key.length); // 16 (padded with zeros)
 * ```
 *
 * @see {@link validateKey} for key validation
 */
export const deriveKey = (
  secret: string,
  requiredBytes: number,
): Uint8Array => {
  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.length >= requiredBytes) {
    return secretBytes.slice(0, requiredBytes);
  }

  // If secret is too short, pad with zeros
  const result = new Uint8Array(requiredBytes);
  result.set(secretBytes);
  return result;
};
