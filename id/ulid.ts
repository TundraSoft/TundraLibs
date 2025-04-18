/**
 * ULID - Universally Unique Lexicographically Sortable Identifier
 *
 * Implementation of the ULID specification:
 * - 128-bit compatibility with UUID
 * - 1.21e+24 unique ULIDs per millisecond
 * - Lexicographically sortable
 * - Canonically encoded as a 26 character string
 * - Case insensitive
 * - No special characters (URL safe)
 * - Monotonic sort order
 *
 * Format: ttttttttttrrrrrrrrrrrrrrrr
 * - First 10 chars: timestamp (48 bits)
 * - Last 16 chars: randomness (80 bits)
 */

// Crockford's Base32 (excludes I, L, O, U to avoid confusion)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10; // 10 characters to encode timestamp
const RANDOM_LEN = 16; // 16 characters to encode random bytes
const ULID_LEN = TIME_LEN + RANDOM_LEN; // 26 total characters

// Store previous state for monotonic ULIDs
let lastTime = 0;
let lastRandom: Uint8Array | null = null;

/**
 * Generate a ULID string
 *
 * @param timestamp Optional timestamp (in ms), defaults to current time
 * @param monotonic Whether to ensure monotonicity when multiple IDs are generated in the same millisecond
 * @returns A 26-character ULID string
 */
export function ulid(timestamp?: number, monotonic = false): string {
  const time = timestamp === undefined ? Date.now() : timestamp;

  // Generate randomness (80 bits = 10 bytes)
  let random: Uint8Array;

  // Handle monotonicity
  if (monotonic && lastTime === time && lastRandom) {
    // Clone and increment the previous random bytes
    random = incrementRandom(lastRandom);
  } else {
    random = crypto.getRandomValues(new Uint8Array(10));
  }

  // Update state for monotonic ULIDs
  if (monotonic) {
    lastTime = time;
    lastRandom = random;
  }

  // Encode time component (48 bits = 10 chars)
  const encodedTime = encodeTime(time);

  // Encode random component (80 bits = 16 chars)
  const encodedRandom = encodeRandom(random);

  return encodedTime + encodedRandom;
}

/**
 * Encode time as Crockford's Base32
 */
function encodeTime(time: number): string {
  if (time < 0 || time > 0xFFFFFFFFFFFF) { // 48 bits max
    throw new Error('Time must be between 0 and 281474976710655');
  }

  let timeStr = '';
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    time = Math.floor(time / ENCODING_LEN);
    timeStr = ENCODING.charAt(mod) + timeStr;
  }

  return timeStr;
}

/**
 * Encode random bytes as Crockford's Base32
 */
function encodeRandom(randomBytes: Uint8Array): string {
  let result = '';

  // We need to encode 80 bits (10 bytes) as 16 Base32 characters
  // Each Base32 character encodes 5 bits
  // Create a bit buffer to process 5 bits at a time
  let buffer = 0;
  let bitsInBuffer = 0;

  for (let i = 0; i < 10; i++) {
    // Add 8 bits to the buffer
    buffer = (buffer << 8) | randomBytes[i]!;
    bitsInBuffer += 8;

    // Extract 5 bits at a time while we have enough bits
    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      const index = (buffer >> bitsInBuffer) & 0x1F; // 0x1F = 31 (5 bits)
      result += ENCODING.charAt(index);
    }
  }

  // If we have remaining bits, pad with 0s and add the final character
  if (bitsInBuffer > 0) {
    const index = (buffer << (5 - bitsInBuffer)) & 0x1F;
    result += ENCODING.charAt(index);
  }

  return result;
}

/**
 * Increment random bytes for monotonic ULIDs
 */
function incrementRandom(randomBytes: Uint8Array): Uint8Array {
  const newRandomBytes = new Uint8Array(randomBytes);

  // Start from the last byte and increment with carry
  for (let i = newRandomBytes.length - 1; i >= 0; i--) {
    if (newRandomBytes[i]! === 0xFF) {
      newRandomBytes[i] = 0;
    } else {
      newRandomBytes[i]!++;
      break;
    }
  }

  return newRandomBytes;
}

/**
 * Extract the timestamp from a ULID string
 */
export function getTimestamp(id: string): number {
  if (id.length !== ULID_LEN) {
    throw new Error(`Invalid ULID: incorrect length (expected ${ULID_LEN})`);
  }

  const timeChars = id.substring(0, TIME_LEN);

  let timestamp = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const char = timeChars[i]!.toUpperCase();
    const value = ENCODING.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid ULID timestamp character: ${char}`);
    }

    timestamp = timestamp * ENCODING_LEN + value;
  }

  return timestamp;
}

/**
 * Generate a monotonic ULID
 * Ensures that ULIDs created within the same millisecond are lexicographically sortable
 */
export function monotonicUlid(timestamp?: number): string {
  return ulid(timestamp, true);
}
