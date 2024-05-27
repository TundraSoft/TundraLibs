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
function initId(counter: number) {
  const serverId = Deno.pid % 65535,
    serverStartupTimeInSeconds = Math.floor(Date.now() / 1000);

  /**
   * Generate a unique ID using server information and a counter.
   *
   * @param {number} cnt - Optional counter value to override current counter.
   * @returns {BigInt} The generated unique ID.
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
 */
export const sequenceId = initId(0);
