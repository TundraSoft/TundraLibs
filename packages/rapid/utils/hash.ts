/**
 * @fileoverview `djb2` — the one cheap sync content hash (cache keys,
 * NOT integrity): asset fingerprints, served-script ETags.
 *
 * @module
 */

/** djb2 over bytes, or over a string's UTF-16 code units. */
export const djb2 = (input: Uint8Array | string): string => {
  let hash = 5381;
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input[i]!) >>> 0;
    }
  }
  return hash.toString(16);
};
