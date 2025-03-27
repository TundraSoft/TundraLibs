/**
 * This will be unique as long as we can manage to get server_id (PID), server_startup_time_in_seconds (to an extent consistent)
 * https://mariadb.com/kb/en/uuid_short/
 *   (server_id & 255) << 56
+ (server_startup_time_in_seconds << 24)
+ incremented_variable++;
 */

/**
 * Generates a unique ID based on server information and a counter.
 *
 * @param {number} counter - The counter used to generate the ID.
 * @returns A function that generates a unique ID.
 */
function initSequenceID(counter: number = 0) {
  let currentCounter = Math.max(0, counter);
  const serverId = BigInt(Deno.pid % 255);
  const serverStartupTimeInSeconds = BigInt(Math.floor(Date.now() / 1000));
  const shiftedServerId = serverId << 56n;
  const shiftedTime = serverStartupTimeInSeconds << 24n;
  const randomComponent = BigInt(Math.floor(Math.random() * 65536)) << 8n;

  /**
   * Generates a unique ID based on server information and a counter.
   *
   * @param {number} counter - The counter used to generate the ID.
   * @param {boolean} useRandomComponent - Whether to add a random component for better collision resistance
   * @returns A function that generates a unique ID.
   */
  return (cnt?: number): bigint => {
    if (cnt !== undefined) {
      if (cnt < 0) {
        throw new Error('Counter cannot be negative');
      }
      currentCounter = cnt;
    }
    return shiftedServerId + shiftedTime + randomComponent +
      BigInt(currentCounter++);
  };
}

/**
 * Generates a unique ID based on server information and a counter.
 * Enhanced with an optional random component for better collision resistance.
 *
 * @param {number} cnt - Optional counter value to override current counter
 * @returns {bigint} The generated unique ID.
 *
 * @example
 * // Basic usage
 * const seq = sequenceID();
 * const id1 = seq();
 * const id2 = seq();
 * console.log(id1); // Logs a unique ID based on server information, a random component, and a counter
 * console.log(id2); // Logs another unique ID with incremented counter
 *
 * @example
 * // Override counter value
 * const seq = sequenceID(100);
 * const id1 = seq();
 * const id2 = seq(100);
 * console.log(id1); // Logs a unique ID with counter starting at 100
 * console.log(id2); // Logs another unique ID with incremented counter
 */
export function sequenceID(
  cnt?: number,
): (counter?: number) => bigint {
  if (cnt !== undefined) {
    if (cnt < 0) {
      throw new Error('Counter cannot be negative');
    }
  }
  // Use the appropriate generator
  return initSequenceID(cnt);
}
