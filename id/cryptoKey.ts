/**
 * Generates a random cryptographic key.
 *
 * @param {number} length - The length of the key. Defaults to 32 if not provided.
 * @param {string} prefix - An optional prefix to be added to the key. Defaults to an empty string if not provided.
 * @param {number} hyphenInterval - The interval at which hyphens should be inserted into the key.
 *                                 If non-zero, will add hyphens at the specified intervals.
 *                                 Defaults to 0 if not provided.
 * @returns {string} The generated cryptographic key.
 */
export const cryptoKey = (
  length = 32, // default length
  prefix = '',
  hyphenInterval = 0, // if non-zero, will add hyphens at the specified intervals
): string => {
  const array = new Uint8Array(length / 2);
  crypto.getRandomValues(array);
  let key = Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
    .join('').padStart(length, '0');
  if (hyphenInterval > 0) {
    const regex = new RegExp(`.{1,${hyphenInterval}}`, 'g');
    key = key.match(regex)!.join('-');
  }
  return `${prefix}${key}`;
};
