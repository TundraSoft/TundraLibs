/**
 * @fileoverview Sequential Database-Friendly ID Generator
 *
 * Generates 64-bit integers suitable for database primary keys, modeled
 * after MariaDB's `UUID_SHORT()` function.
 *
 * ## Bit layout
 *
 * ```
 *   bits 56-63 │ bits 24-55              │ bits 0-23
 *   server_id  │ startup_time (seconds)  │ counter
 *   (8 bits)   │ (32 bits)               │ (24 bits)
 * ```
 *
 * Where `server_id = getProcessId() % 256` (or `0` if PID unavailable).
 *
 * This matches MariaDB's `UUID_SHORT` exactly. There is **no random
 * component**: per-process uniqueness comes entirely from `(server_id,
 * startup_time)`, and within a process from the monotonic counter.
 *
 * ## Uniqueness scope and limits
 *
 * 1. **Within a single generator**: every ID is distinct up to **16,777,216
 *    calls per startup-second** (24-bit counter). Beyond that the counter
 *    spills into the startup-time bits, so any value emitted past that
 *    point may collide with values from a hypothetical generator created
 *    in a later second. For realistic workloads this limit is not a
 *    concern — but if a single process emits >16M IDs in one second from
 *    one generator, switch to {@link ulid} or {@link ObjectID}.
 * 2. **Across generators in the same process and startup-second**:
 *    **they collide from call 0.** Every generator in a given process
 *    starts with the same prefix and counter=0. Treat `sequenceID()` as
 *    a singleton per logical sequence — instantiate once at module
 *    scope, share the returned function across all callers, and never
 *    create one per request.
 * 3. **Across processes**: discriminated by `(server_id, startup_time)`.
 *    Two processes with identical `PID % 256` that start in the same
 *    wall-clock second will produce identical IDs. PID-modulo collisions
 *    happen every 256 PIDs (e.g., PIDs 1, 257, 513, …). For
 *    distributed/clustered use, prefer {@link ulid} (sortable,
 *    cryptographically random) or {@link ObjectID} (machine + process
 *    + counter, MongoDB-style).
 *
 * Within a single generator on a single JS runtime, the counter
 * increment is safe — JS is single-threaded inside one VM context.
 *
 * @author TundraSoft
 * @see {@link https://mariadb.com/kb/en/uuid_short/} MariaDB UUID_SHORT documentation
 *
 * @module
 *
 * @example
 * ```typescript
 * import { sequenceID } from './sequenceID.ts';
 *
 * // Create ONCE per logical sequence (e.g., per table) at module scope.
 * const seq = sequenceID();
 * const id1 = seq(); // 1234567890123456789n
 * const id2 = seq(); // 1234567890123456790n
 *
 * // Start with a specific counter value
 * const customSeq = sequenceID(1000);
 * const customId = customSeq(); // Starts counting from 1000
 * ```
 */
import { getProcessId } from '@tundralibs/compat';
import { InvalidOptionError } from './errors/mod.ts';

/**
 * Creates a sequential ID generator with server-based uniqueness.
 *
 * Initializes a generator function that produces unique 64-bit integers
 * incorporating server ID, startup time, random component, and counter.
 * This ensures uniqueness even across multiple processes and restarts.
 *
 * @param counter - Initial counter value (default: 0). Callers reach this
 *   only through {@link sequenceID}, which rejects negative and non-integer
 *   values; the returned generator likewise throws {@link InvalidOptionError}
 *   on a negative or non-integer per-call override. The `Math.max(0, …)` here
 *   is a defensive floor, not the primary guard.
 * @returns Generator function that produces unique sequential IDs
 *
 * @internal
 */
function initSequenceID(counter: number = 0) {
  let currentCounter = Math.max(0, counter);

  // Server ID component (8 bits): derived from process ID, modulo 256 so the
  // full 0-255 range is usable (matches MariaDB's 8-bit server_id; `% 255`
  // dropped value 255 and collided PIDs every 255 instead of 256).
  const serverId = BigInt((getProcessId() ?? 0) % 256);

  // Startup time component (32 bits): current timestamp in seconds.
  const serverStartupTimeInSeconds = BigInt(Math.floor(Date.now() / 1000));

  // Pre-shifted fixed prefix — recomputed once per generator.
  const prefix = (serverId << 56n) + (serverStartupTimeInSeconds << 24n);

  /**
   * Generates the next sequential ID in the sequence.
   *
   * @param cnt - Optional counter override. If provided, resets the internal counter
   * @returns A 64-bit integer ID
   *
   * @throws {@link InvalidOptionError} If the counter override is negative or
   *   not a safe integer (NaN, a fractional value, or Infinity)
   *
   * @example
   * ```typescript
   * const generator = initSequenceID();
   * const id1 = generator();      // Uses internal counter
   * const id2 = generator(5000);  // Resets counter to 5000
   * const id3 = generator();      // Continues from 5001
   * ```
   */
  return (cnt?: number): bigint => {
    if (cnt !== undefined) {
      if (cnt < 0) {
        throw new InvalidOptionError('Counter cannot be negative', {
          generator: 'sequenceID',
          option: 'counter',
          value: cnt,
        });
      }
      // Reject NaN / fractional / Infinity up front: BigInt() would otherwise
      // throw a raw RangeError at generation time (far from the bad input),
      // bypassing the documented InvalidOptionError contract.
      if (!Number.isInteger(cnt)) {
        throw new InvalidOptionError('Counter must be an integer', {
          generator: 'sequenceID',
          option: 'counter',
          value: cnt,
        });
      }
      currentCounter = cnt;
    }
    return prefix + BigInt(currentCounter++);
  };
}

/**
 * Creates a database-friendly sequential ID generator.
 *
 * Generates 64-bit integers suitable for use as database primary keys.
 * Each ID combines server information, timestamp, random component,
 * and an incrementing counter.
 *
 * Properties:
 * - **Sequential within a generator**: counter monotonically increases.
 * - **Compact**: 64-bit integers, efficient for storage and indexing.
 * - **Traceable**: high bits embed server PID and startup time.
 * - **Probabilistic across generators / processes**: see the module-level
 *   uniqueness notes — collisions are possible at scale; reuse a single
 *   generator per logical sequence to minimize them.
 *
 * @param cnt - Initial counter value (default: 0, must be a non-negative
 *   integer)
 * @returns Generator function that produces sequential bigint IDs
 *
 * @throws {@link InvalidOptionError} If initial counter value is negative or
 *   not a safe integer (NaN, a fractional value, or Infinity)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const seq = sequenceID();
 * const id1 = seq(); // 72623859790382856n
 * const id2 = seq(); // 72623859790382857n
 *
 * // With custom starting counter
 * const customSeq = sequenceID(1000);
 * const customId1 = customSeq(); // Starts from 1000
 * const customId2 = customSeq(); // 1001
 *
 * // Override counter mid-sequence
 * const flexSeq = sequenceID();
 * const id1 = flexSeq();       // Uses internal counter
 * const id2 = flexSeq(5000);   // Resets to 5000
 * const id3 = flexSeq();       // Continues from 5001
 *
 * // Use as database primary key
 * const userIdGen = sequenceID();
 * const userId = userIdGen().toString(); // Convert to string for DB
 * ```
 */
export function sequenceID(
  cnt?: number,
): (counter?: number) => bigint {
  if (cnt !== undefined) {
    if (cnt < 0) {
      throw new InvalidOptionError('Counter cannot be negative', {
        generator: 'sequenceID',
        option: 'counter',
        value: cnt,
      });
    }
    // Reject NaN / fractional / Infinity up front: BigInt() would otherwise
    // throw a raw RangeError on the first generation call (e.g. an unset
    // `Number(process.env.SEED)` -> NaN), bypassing the documented
    // InvalidOptionError contract.
    if (!Number.isInteger(cnt)) {
      throw new InvalidOptionError('Counter must be an integer', {
        generator: 'sequenceID',
        option: 'counter',
        value: cnt,
      });
    }
  }
  // Use the appropriate generator
  return initSequenceID(cnt);
}
