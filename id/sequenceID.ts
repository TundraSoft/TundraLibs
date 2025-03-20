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
function initSequenceID(counter: number) {
  const serverId = Deno.pid % 65535,
    serverStartupTimeInSeconds = Math.floor(Date.now() / 1000);

  /**
   * Generate a unique ID using server information and a counter.
   *
   * @param {number} cnt - Optional counter value to override current counter.
   * @returns {BigInt} The generated unique ID.
   *
   * @example
   * // Basic usage
   * const generateID = initSequenceID(0);
   * const id1 = generateID();
   * const id2 = generateID();
   * console.log(id1); // Logs a unique ID based on server information and a counter
   * console.log(id2); // Logs another unique ID
   *
   * @example
   * // Override counter value
   * const generateID = initSequenceID(0);
   * const id1 = generateID(100);
   * const id2 = generateID();
   * console.log(id1); // Logs a unique ID with counter starting at 100
   * console.log(id2); // Logs another unique ID with incremented counter
   */
  return (cnt?: number): bigint => {
    if (cnt !== undefined) {
      counter = cnt;
    }
    return (BigInt(serverId) << BigInt(56)) +
      (BigInt(serverStartupTimeInSeconds) << BigInt(24)) + BigInt(counter++);
  };
}

/**
 * Generates a unique ID based on server information and a counter.
 *
 * @example
 * // Basic usage
 * const id1 = sequenceID();
 * const id2 = sequenceID();
 * console.log(id1); // Logs a unique ID based on server information and a counter
 * console.log(id2); // Logs another unique ID
 *
 * @example
 * // Override counter value
 * const id1 = sequenceID(100);
 * const id2 = sequenceID();
 * console.log(id1); // Logs a unique ID with counter starting at 100
 * console.log(id2); // Logs another unique ID with incremented counter
 */
export const sequenceID: (cnt?: number) => bigint = initSequenceID(0);
