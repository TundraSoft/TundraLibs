/**
 * @fileoverview ULID - Universally Unique Lexicographically Sortable Identifier
 *
 * A specification compliant implementation of ULID.
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
 * @module
 *
 * @example
 * ```typescript
 * import { ulid, monotonicUlid, monotonicFactory, getTimestamp } from './ulid.ts';
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
 * // Independent monotonic streams that don't corrupt each other
 * const next = monotonicFactory();
 * const a = next();
 * const b = next(); // a < b
 *
 * // Extract timestamp from ULID
 * const timestamp = getTimestamp(id); // Returns original timestamp
 * ```
 */

import {
  InvalidOptionError,
  InvalidULIDError,
  MonotonicOverflowError,
} from './errors/mod.ts';

// Crockford's Base32 alphabet (excludes I, L, O, U to avoid visual confusion)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length; // 32

/** Length of the timestamp component in characters */
const TIME_LEN = 10; // 10 characters to encode 48-bit timestamp

/** Length of the randomness component in characters */
const RANDOM_LEN = 16; // 16 characters to encode 80-bit randomness

/** Total length of a ULID string */
const ULID_LEN = TIME_LEN + RANDOM_LEN; // 26 total characters

/**
 * The mutable state a single monotonic generator carries between calls:
 * the last timestamp it emitted at, and the random component it used so
 * the next call within the same millisecond can increment it.
 *
 * @internal
 */
type MonotonicState = {
  lastTime: number;
  lastRandom: Uint8Array | null;
};

/**
 * Generates a ULID (Universally Unique Lexicographically Sortable Identifier).
 *
 * Creates a 26-character string identifier that combines a timestamp component
 * with cryptographically secure randomness. The resulting ID is lexicographically
 * sortable by creation time and provides excellent collision resistance.
 *
 * For monotonic generation, prefer {@link monotonicFactory} so each call site
 * owns its own increment chain. The `monotonic` flag here shares a single
 * process-wide chain (via {@link monotonicUlid}) and exists for convenience and
 * backwards compatibility; independent callers passing `monotonic = true` will
 * interleave on that shared chain.
 *
 * **Monotonic mode clamps the timestamp.** With `monotonic = true` the supplied
 * `timestamp` is subject to the shared chain's clock-regression clamp: if it is
 * at or before the last time that chain emitted, the returned ULID embeds that
 * last time — **not** the value you passed — and increments the random
 * component to preserve ordering (see {@link monotonicUlid}). To embed an
 * arbitrary or older timestamp exactly (e.g. backfilling historical records),
 * use non-monotonic `ulid(timestamp)` or a fresh {@link monotonicFactory}.
 *
 * @param timestamp - Unix timestamp in milliseconds (default: current time).
 *   With `monotonic = true`, a value at or before the shared chain's last
 *   emitted time is clamped forward — the ULID then embeds the clamped time,
 *   not this value (see the note above and {@link monotonicUlid}).
 * @param monotonic - Ensures lexicographic ordering within same millisecond (default: false)
 * @returns A 26-character ULID string using Crockford's Base32 encoding
 *
 * @throws {@link InvalidOptionError} If timestamp is outside valid range
 *   (0 to 2^48-1) or is not an integer (NaN, fractional, or Infinity)
 * @throws {@link MonotonicOverflowError} If the monotonic random component
 *   overflows within a millisecond (more than 2^80 IDs requested at the
 *   same timestamp)
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
  if (monotonic) {
    return defaultMonotonic(timestamp);
  }
  const time = timestamp ?? Date.now();
  const random = crypto.getRandomValues(new Uint8Array(10));
  return encodeTime(time) + encodeRandom(random);
}

/**
 * Generates the next ULID for a monotonic generator, mutating {@link state}
 * in place so the next call continues the same increment chain.
 *
 * The chain is clamped against clock regression: when the requested time is at
 * or before the last emitted time (same millisecond, an NTP/VM-resume step
 * back, or an explicit older timestamp argument), the generator keeps emitting
 * at `lastTime` and increments the random component instead of minting a fresh
 * random ULID that would sort *before* the previous one. This matches the ULID
 * reference implementation and preserves monotonicity — at the cost of the
 * embedded timestamp being clamped forward to `lastTime` on regression.
 *
 * @param state - The generator's private {@link MonotonicState}
 * @param timestamp - Unix timestamp in milliseconds (default: current time)
 * @returns A 26-character monotonic ULID string
 *
 * @throws {@link InvalidOptionError} If timestamp is outside valid range
 *   (0 to 2^48-1) or is not an integer
 * @throws {@link MonotonicOverflowError} If the random component overflows
 *   within a millisecond
 *
 * @internal
 */
function nextMonotonic(state: MonotonicState, timestamp?: number): string {
  const time = timestamp ?? Date.now();

  // Validate the raw timestamp up front (throws InvalidOptionError for
  // negative, non-integer, or >48-bit values) so an explicit bad argument is
  // rejected as documented even when we end up clamping below.
  const encodedTime = encodeTime(time);

  // Clamp against clock regression / same-millisecond: if the requested time
  // is at or before the last emitted time, keep emitting at `lastTime` and
  // increment the previous random bytes so the new ULID sorts strictly after
  // the previous one. Without this, an earlier timestamp would take the
  // fresh-random branch and encode a smaller time, silently breaking the
  // documented sort order across NTP step-backs / VM resume / older args.
  if (state.lastRandom && time <= state.lastTime) {
    const random = incrementRandom(state.lastRandom, state.lastTime);
    state.lastRandom = random;
    return encodeTime(state.lastTime) + encodeRandom(random);
  }

  const random = crypto.getRandomValues(new Uint8Array(10));
  state.lastTime = time;
  state.lastRandom = random;

  return encodedTime + encodeRandom(random);
}

/**
 * Creates a monotonic ULID generator with its own private increment chain.
 *
 * Each factory instance owns its `(lastTime, lastRandom)` state in a closure,
 * so independent call sites do not corrupt each other's monotonic ordering.
 * Prefer this over the process-wide {@link monotonicUlid} whenever more than
 * one logical stream of monotonic ULIDs is generated in the same process.
 *
 * @returns A generator function taking an optional timestamp and returning a
 *   26-character monotonic ULID string
 *
 * @throws {@link InvalidOptionError} (from the returned generator) If timestamp
 *   is outside valid range (0 to 2^48-1) or is not an integer
 * @throws {@link MonotonicOverflowError} (from the returned generator) If the
 *   random component overflows within a millisecond
 *
 * @example
 * ```typescript
 * const next = monotonicFactory();
 * const a = next(); // each call is guaranteed > the previous within a ms
 * const b = next();
 * // a < b
 * ```
 */
export function monotonicFactory(): (timestamp?: number) => string {
  const state: MonotonicState = { lastTime: 0, lastRandom: null };
  return (timestamp?: number) => nextMonotonic(state, timestamp);
}

// Process-wide monotonic generator backing `monotonicUlid()` and
// `ulid(ts, true)`. A single shared chain, kept for backwards compatibility;
// independent streams should use `monotonicFactory()` instead.
const defaultMonotonic = monotonicFactory();

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
 * @throws {@link InvalidOptionError} If timestamp is not a safe integer (NaN,
 *   a fractional value, or Infinity) or is outside the valid 48-bit range
 *
 * @internal
 */
function encodeTime(time: number): string {
  // `!Number.isInteger` catches NaN, fractional, and Infinity — each of which
  // would otherwise slip past the `< 0 || > max` comparisons (NaN compares
  // false both ways) and encode lossily (`NaN % 32` -> index 0 -> epoch-0
  // ULID; `1.5` -> timestamp 1), minting a structurally valid but wrong ID.
  if (!Number.isInteger(time) || time < 0 || time > 0xFFFFFFFFFFFF) {
    // 48 bits max (281,474,976,710,655 ms)
    throw new InvalidOptionError('Time must be between 0 and 281474976710655', {
      generator: 'ulid',
      option: 'timestamp',
      value: time,
    });
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
 * Increments random bytes for monotonic ULID generation.
 *
 * Performs a carry-over increment operation on the random byte array,
 * similar to adding 1 to a big-endian integer. This ensures that
 * subsequent ULIDs with the same timestamp are lexicographically ordered.
 *
 * If every byte is `0xFF` the increment carries out of the top byte; wrapping
 * back to `00..00` would make the next ULID sort *before* the previous one,
 * silently breaking monotonicity. Per the ULID spec this is an error, so we
 * throw rather than wrap.
 *
 * @param randomBytes - The random bytes to increment
 * @param timestamp - The millisecond timestamp the increment is happening at,
 *   attached to {@link MonotonicOverflowError} if the space is exhausted
 * @returns A new array with incremented bytes
 *
 * @throws {@link MonotonicOverflowError} If the increment overflows (all bytes
 *   were `0xFF`)
 *
 * @internal
 *
 * @example
 * ```typescript ignore
 * const bytes = new Uint8Array([0x00, 0x00, 0xFF, 0xFF]);
 * const incremented = incrementRandom(bytes, Date.now()); // [0x00, 0x01, 0x00, 0x00]
 * ```
 */
function incrementRandom(
  randomBytes: Uint8Array,
  timestamp: number,
): Uint8Array {
  const newRandomBytes = new Uint8Array(randomBytes);

  // Perform carry-over increment from right to left (big-endian)
  for (let i = newRandomBytes.length - 1; i >= 0; i--) {
    const currentByte = newRandomBytes[i]!;
    if (currentByte === 0xFF) {
      newRandomBytes[i] = 0; // Overflow, carry to next byte
    } else {
      newRandomBytes[i] = currentByte + 1;
      return newRandomBytes; // No carry needed
    }
  }

  // Fell through the loop without breaking: the carry propagated out of the
  // most-significant byte. Wrapping would violate monotonic ordering.
  throw new MonotonicOverflowError(
    'Monotonic ULID random component overflowed within a millisecond',
    { timestamp },
  );
}

/**
 * Extracts the timestamp component from a ULID string.
 *
 * Fully validates the ULID before decoding: the string must be exactly 26
 * characters, every character (timestamp **and** random segment) must be a
 * valid Crockford's Base32 symbol, and the decoded 48-bit timestamp must not
 * exceed the maximum {@link ulid} itself would ever encode. Useful for
 * debugging, logging, time-based queries, and as the package's ULID
 * validation entry point.
 *
 * @param id - A valid 26-character ULID string
 * @returns Unix timestamp in milliseconds
 *
 * @throws {@link InvalidULIDError} If ULID format is invalid: wrong length, a
 *   character outside Crockford's Base32 anywhere in the string, or a
 *   timestamp segment above the 48-bit maximum
 *
 * @example
 * ```typescript
 * const id = ulid(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 * const timestamp = getTimestamp(id); // 1546300800000
 * const date = new Date(timestamp); // 2019-01-01T00:00:00.000Z
 *
 * // Validate ULID age
 * const someUlid = ulid();
 * const ageMs = Date.now() - getTimestamp(someUlid);
 * const ageHours = ageMs / (1000 * 60 * 60);
 * ```
 */
export function getTimestamp(id: string): number {
  if (id.length !== ULID_LEN) {
    throw new InvalidULIDError(
      `Invalid ULID: incorrect length (expected ${ULID_LEN})`,
      { id, reason: 'length', expected: ULID_LEN },
    );
  }

  const timeChars = id.substring(0, TIME_LEN);

  let timestamp = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const char = timeChars[i]!.toUpperCase();
    const value = ENCODING.indexOf(char);
    if (value === -1) {
      throw new InvalidULIDError(`Invalid ULID timestamp character: ${char}`, {
        id,
        reason: 'character',
        character: char,
      });
    }

    timestamp = timestamp * ENCODING_LEN + value;
  }

  // Validate the random segment (chars 10-25) too. getTimestamp is the only
  // ULID decode/validation entry point, and its contract rejects any character
  // outside Crockford's Base32 — not only the ones in the timestamp segment.
  for (let i = TIME_LEN; i < ULID_LEN; i++) {
    const char = id[i]!.toUpperCase();
    if (ENCODING.indexOf(char) === -1) {
      throw new InvalidULIDError(`Invalid ULID character: ${char}`, {
        id,
        reason: 'character',
        character: char,
      });
    }
  }

  // A 10-char Crockford segment can encode up to 2^50-1, but a ULID timestamp
  // is only 48 bits. Reject values the encoder ({@link encodeTime}) would never
  // mint so decode and encode agree on the valid range (any leading char above
  // '7' overflows).
  if (timestamp > 0xFFFFFFFFFFFF) {
    throw new InvalidULIDError(
      'Invalid ULID: timestamp exceeds 48-bit maximum (281474976710655)',
      { id, reason: 'timestamp' },
    );
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
 * Ordering is preserved even if the clock steps backwards (NTP correction,
 * VM resume) or an explicitly older `timestamp` is passed: the generator
 * clamps to the last emitted time and increments the random component rather
 * than minting a smaller ULID. On such a regression the ID's embedded
 * timestamp is the clamped (last) time, not the requested one.
 *
 * @param timestamp - Unix timestamp in milliseconds (default: current time)
 * @returns A 26-character monotonic ULID string
 *
 * @throws {@link InvalidOptionError} If timestamp is outside valid range
 *   (0 to 2^48-1) or is not an integer (NaN, fractional, or Infinity)
 * @throws {@link MonotonicOverflowError} If the random component overflows
 *   within a millisecond (more than 2^80 IDs requested at the same timestamp)
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
 * Note: This uses a single process-wide increment chain, so all callers of
 * `monotonicUlid()` (and `ulid(ts, true)`) share it. When more than one
 * independent stream of monotonic ULIDs is needed in the same process, use
 * {@link monotonicFactory} so each stream owns its own chain. Not thread-safe
 * across isolates or workers; use regular `ulid()` for concurrent scenarios.
 */
export function monotonicUlid(timestamp?: number): string {
  return defaultMonotonic(timestamp);
}
