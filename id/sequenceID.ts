/**
 * @fileoverview Sequential Database-Friendly ID Generator
 *
 * Generates unique 64-bit integers suitable for database primary keys.
 * Based on MariaDB's UUID_SHORT() function algorithm, ensuring uniqueness
 * across distributed systems by incorporating server information and timing.
 *
 * The ID format follows the MariaDB UUID_SHORT structure:
 * - (server_id & 255) << 56
 * - (server_startup_time_in_seconds << 24)
 * - random_component << 8
 * - incremented_counter
 *
 * @author TundraSoft
 * @see {@link https://mariadb.com/kb/en/uuid_short/} MariaDB UUID_SHORT documentation
 *
 * @example
 * ```typescript
 * import { sequenceID } from './sequenceID.ts';
 *
 * // Create a sequence generator
 * const seq = sequenceID();
 * const id1 = seq(); // 1234567890123456789n
 * const id2 = seq(); // 1234567890123456790n
 *
 * // Start with a specific counter value
 * const customSeq = sequenceID(1000);
 * const customId = customSeq(); // Starts counting from 1000
 * ```
 */

/**
 * Creates a sequential ID generator with server-based uniqueness.
 *
 * Initializes a generator function that produces unique 64-bit integers
 * incorporating server ID, startup time, random component, and counter.
 * This ensures uniqueness even across multiple processes and restarts.
 *
 * @param counter - Initial counter value (default: 0)
 * @returns Generator function that produces unique sequential IDs
 *
 * @throws {Error} If counter is negative
 *
 * @internal
 */
function initSequenceID(counter: number = 0) {
  let currentCounter = Math.max(0, counter);

  // Server ID component (8 bits): derived from process ID
  const serverId = BigInt(Deno.pid % 255);

  // Startup time component (32 bits): current timestamp in seconds
  const serverStartupTimeInSeconds = BigInt(Math.floor(Date.now() / 1000));

  // Pre-calculated bit shifts for performance
  const shiftedServerId = serverId << 56n;
  const shiftedTime = serverStartupTimeInSeconds << 24n;

  // Random component (16 bits): adds entropy to prevent collisions
  const randomComponent = BigInt(Math.floor(Math.random() * 65536)) << 8n;

  /**
   * Generates the next sequential ID in the sequence.
   *
   * @param cnt - Optional counter override. If provided, resets the internal counter
   * @returns A unique 64-bit integer ID
   *
   * @throws {Error} If provided counter is negative
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
        throw new Error("Counter cannot be negative");
      }
      currentCounter = cnt;
    }
    return shiftedServerId + shiftedTime + randomComponent +
      BigInt(currentCounter++);
  };
}

/**
 * Creates a database-friendly sequential ID generator.
 *
 * Generates unique 64-bit integers suitable for use as database primary keys.
 * Each ID incorporates server information, timestamp, random component, and
 * an incrementing counter to ensure uniqueness across distributed systems.
 *
 * The generated IDs are:
 * - **Unique**: Collision-resistant across multiple processes and machines
 * - **Sequential**: Monotonically increasing for better database performance
 * - **Compact**: 64-bit integers, efficient for storage and indexing
 * - **Traceable**: Embed server and timing information for debugging
 *
 * @param cnt - Initial counter value (default: 0, must be non-negative)
 * @returns Generator function that produces unique sequential bigint IDs
 *
 * @throws {Error} If initial counter value is negative
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
      throw new Error("Counter cannot be negative");
    }
  }
  // Use the appropriate generator
  return initSequenceID(cnt);
}
