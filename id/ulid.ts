/**
 * @fileoverview ULID - Universally Unique Lexicographically Sortable Identifier
 *
 * A specification compliant implementation of ULID for Deno.
 * ULIDs are 128-bit identifiers that are lexicographically sortable
 * and compatible with UUID while being more readable and efficient.
 *
 * **ULID Features:**
 * - **128-bit compatibility** with UUID
 * - **1.21e+24 unique ULIDs** per millisecond
 * - **Lexicographically sortable** by creation time
 * - **Canonically encoded** as a 26-character string
 * - **Case insensitive** and **URL safe**
 * - **No special characters** (uses Crockford's Base32)
 * - **Monotonic sort order** within the same millisecond (optional)
 *
 * **Format Structure:**
 * ```
 * ttttttttttrrrrrrrrrrrrrrrr
 * ├─────────┤├─────────────┤
 * │    10   ││     16      │
 * │ chars   ││   chars     │
 * │timestamp││ randomness  │
 * ```
 *
 * @see {@link https://github.com/ulid/spec} ULID Specification
 *
 * @example
 * ```typescript
 * import { ulid, monotonicUlid, getTimestamp } from './ulid.ts';
 *
 * // Generate a ULID
 * const id = ulid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 *
 * // Generate with specific timestamp
 * const customId = ulid(Date.now()); // Use current time explicitly
 *
 * // Generate monotonic ULIDs (sorted within same millisecond)
 * const mono1 = monotonicUlid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 * const mono2 = monotonicUlid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAW"
 *
 * // Extract timestamp from ULID
 * const timestamp = getTimestamp(id); // Returns original timestamp
 * ```
 */

// Crockford's Base32 alphabet (excludes I, L, O, U to avoid visual confusion)
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length; // 32

/** Length of the timestamp component in characters */
const TIME_LEN = 10; // 10 characters to encode 48-bit timestamp

/** Length of the randomness component in characters */
const RANDOM_LEN = 16; // 16 characters to encode 80-bit randomness

/** Total length of a ULID string */
const ULID_LEN = TIME_LEN + RANDOM_LEN; // 26 total characters

// Monotonic ULID state management
let lastTime = 0;
let lastRandom: Uint8Array | null = null;

/**
 * Generates a ULID (Universally Unique Lexicographically Sortable Identifier).
 *
 * Creates a 26-character string identifier that combines a timestamp component
 * with cryptographically secure randomness. The resulting ID is lexicographically
 * sortable by creation time and provides excellent collision resistance.
 *
 * @param timestamp - Unix timestamp in milliseconds (default: current time)
 * @param monotonic - Ensures lexicographic ordering within same millisecond (default: false)
 * @returns A 26-character ULID string using Crockford's Base32 encoding
 *
 * @throws {Error} If timestamp is outside valid range (0 to 2^48-1)
 *
 * @example
 * ```typescript
 * // Generate a ULID with current timestamp
 * const id1 = ulid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 *
 * // Generate with specific timestamp
 * const id2 = ulid(1609459200000); // New Year 2021
 *
 * // Generate monotonic ULIDs (sorted within same millisecond)
 * const mono1 = ulid(Date.now(), true);
 * const mono2 = ulid(Date.now(), true); // Guaranteed > mono1 if same timestamp
 *
 * // For high-frequency generation in same process
 * const batch = Array.from({ length: 1000 }, () => ulid(Date.now(), true));
 * // All IDs will be lexicographically sorted
 * ```
 *
 * @security
 * - 80 bits of cryptographically secure randomness
 * - Resistant to timing attacks
 * - No predictable patterns in random component
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
 * Encodes a timestamp as a Crockford's Base32 string.
 *
 * Converts a Unix timestamp (milliseconds) into a 10-character
 * Base32 string using Crockford's alphabet. The encoding preserves
 * lexicographic ordering of timestamps.
 *
 * @param time - Unix timestamp in milliseconds (0 to 2^48-1)
 * @returns 10-character Base32 encoded timestamp
 *
 * @throws {Error} If timestamp is outside valid 48-bit range
 *
 * @internal
 */
function encodeTime(time: number): string {
  if (time < 0 || time > 0xFFFFFFFFFFFF) { // 48 bits max (281,474,976,710,655 ms)
    throw new Error("Time must be between 0 and 281474976710655");
  }

  let timeStr = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    time = Math.floor(time / ENCODING_LEN);
    timeStr = ENCODING.charAt(mod) + timeStr;
  }

  return timeStr;
}

/**
 * Encodes random bytes as a Crockford's Base32 string.
 *
 * Converts 10 bytes (80 bits) of random data into a 16-character
 * Base32 string. Uses bit manipulation to efficiently process
 * 5 bits at a time for optimal Base32 encoding.
 *
 * @param randomBytes - 10-byte array of random data
 * @returns 16-character Base32 encoded random string
 *
 * @internal
 */
function encodeRandom(randomBytes: Uint8Array): string {
  let result = "";

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
 * Increments random bytes for monotonic ULID generation.
 *
 * Performs a carry-over increment operation on the random byte array,
 * similar to adding 1 to a big-endian integer. This ensures that
 * subsequent ULIDs with the same timestamp are lexicographically ordered.
 *
 * @param randomBytes - The random bytes to increment
 * @returns A new array with incremented bytes
 *
 * @internal
 *
 * @example
 * ```typescript
 * const bytes = new Uint8Array([0x00, 0x00, 0xFF, 0xFF]);
 * const incremented = incrementRandom(bytes); // [0x00, 0x01, 0x00, 0x00]
 * ```
 */
function incrementRandom(randomBytes: Uint8Array): Uint8Array {
  const newRandomBytes = new Uint8Array(randomBytes);

  // Perform carry-over increment from right to left (big-endian)
  for (let i = newRandomBytes.length - 1; i >= 0; i--) {
    const currentByte = newRandomBytes[i]!;
    if (currentByte === 0xFF) {
      newRandomBytes[i] = 0; // Overflow, carry to next byte
    } else {
      newRandomBytes[i] = currentByte + 1;
      break; // No carry needed
    }
  }

  return newRandomBytes;
}

/**
 * Extracts the timestamp component from a ULID string.
 *
 * Decodes the first 10 characters of a ULID to retrieve the original
 * Unix timestamp (in milliseconds) when the ULID was created.
 * Useful for debugging, logging, or time-based queries.
 *
 * @param id - A valid 26-character ULID string
 * @returns Unix timestamp in milliseconds
 *
 * @throws {Error} If ULID format is invalid (incorrect length or characters)
 *
 * @example
 * ```typescript
 * const id = ulid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 * const timestamp = getTimestamp(id); // 1546300800000
 * const date = new Date(timestamp); // 2019-01-01T00:00:00.000Z
 *
 * // Validate ULID age
 * const ageMs = Date.now() - getTimestamp(someUlid);
 * const ageHours = ageMs / (1000 * 60 * 60);
 * ```
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
 * Generates a monotonic ULID with guaranteed lexicographic ordering.
 *
 * Creates ULIDs that maintain lexicographic sort order even when generated
 * within the same millisecond. This is achieved by incrementing the random
 * component when the timestamp hasn't changed since the last generation.
 *
 * **Benefits of Monotonic ULIDs:**
 * - Guaranteed sort order within same millisecond
 * - Better database index performance
 * - Consistent ordering in high-frequency scenarios
 * - Maintains randomness across different timestamps
 *
 * @param timestamp - Unix timestamp in milliseconds (default: current time)
 * @returns A 26-character monotonic ULID string
 *
 * @example
 * ```typescript
 * // Generate multiple ULIDs in same millisecond
 * const ids = Array.from({ length: 100 }, () => monotonicUlid());
 *
 * // Verify they're sorted (they will be!)
 * const sorted = [...ids].sort();
 * console.log(ids.every((id, i) => id === sorted[i])); // true
 *
 * // Use for high-frequency logging
 * const logId1 = monotonicUlid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 * const logId2 = monotonicUlid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAW"
 * // logId2 > logId1 guaranteed
 * ```
 *
 * Note: This implementation maintains global state and is not thread-safe
 * across multiple isolates or workers. Use regular `ulid()` for concurrent scenarios.
 */
export function monotonicUlid(timestamp?: number): string {
  return ulid(timestamp, true);
}
