/**
 * Generates a random cryptographic key.
 *
 * @param {number} length - The length of the key. Defaults to 32 if not provided.
 * @param {string} prefix - An optional prefix to be added to the key. Defaults to an empty string if not provided.
 * @param {number} hyphenInterval - The interval at which hyphens should be inserted into the key.
 *                                 If non-zero, will add hyphens at the specified intervals.
 *                                 Defaults to 0 if not provided.
 * @returns {string} The generated cryptographic key.
 *
 * @example
 * // Basic usage
 * const key = keyGenerator();
 * console.log(key); // Logs a 32-character random key
 *
 * @example
 * // Generate a key with a specific length
 * const key = keyGenerator(64);
 * console.log(key); // Logs a 64-character random key
 *
 * @example
 * // Generate a key with a prefix
 * const key = keyGenerator(32, 'prefix-');
 * console.log(key); // Logs a 32-character random key with 'prefix-' at the beginning
 *
 * @example
 * // Generate a key with hyphens inserted at intervals
 * const key = keyGenerator(32, '', 4);
 * console.log(key); // Logs a 32-character random key with hyphens inserted every 4 characters
 */
export const keyGenerator = (
  length = 32, // default length
  prefix = '',
  hyphenInterval = 0, // if non-zero, will add hyphens at the specified intervals
): string => {
  // Calculate required bytes (each byte becomes 2 hex chars)
  const bytesNeeded = Math.ceil(length / 2);
  const array = new Uint8Array(bytesNeeded);
  crypto.getRandomValues(array);

  // Convert to hex and ensure exact length
  let key = Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
    .join('').slice(0, length);

  if (hyphenInterval) {
    // Ensure hyphenInterval is a positive number
    if (typeof hyphenInterval !== 'number' || hyphenInterval < 0) {
      throw new Error('hyphenInterval must be a positive number');
    }
    const regex = new RegExp(`.{1,${hyphenInterval}}`, 'g');
    key = key.match(regex)!.join('-');
  }
  return `${prefix}${key}`;
};
