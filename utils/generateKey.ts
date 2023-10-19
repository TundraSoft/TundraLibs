export const generateKey = (
  length = 32, // default length
  prefix = "",
  hyphenInterval = 0 // if non-zero, will add hyphens at the specified intervals
): string => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let key = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  if (hyphenInterval > 0) {
    const regex = new RegExp(`.{1,${hyphenInterval}}`, 'g');
    key = key.match(regex)!.join('-');
  }
  return `${prefix}${key}`;
}

// Example usage:
console.log(generateKey(32, "ANQ-"));
