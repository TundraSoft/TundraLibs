/**
 * Validates if a secret key is appropriate for the given algorithm
 *
 * @param {string} secret - The secret key to validate
 * @param {string} algorithm - The algorithm name
 * @param {number} bitLength - The required bit length
 * @returns {boolean} Whether the key is valid
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
 * Derives a key of the exact required length from a secret
 *
 * @param {string} secret - The input secret
 * @param {number} requiredBytes - The required number of bytes
 * @returns {Uint8Array} A byte array of the required length
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
