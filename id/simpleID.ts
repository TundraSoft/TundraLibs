import { format } from '$datetime';
/**
 * Generates a sequential ID based on the current date and
 * a seed value. The resulting id is a BigInt which is concatenated
 * date and seed value (padded if required)
 *
 * @param seed number The seed to start with
 * @param minLen number The min length of seed value added to the date
 * @param includeMicroseconds boolean Whether to include microseconds in the timestamp for better collision resistance
 * @returns A function that generates a unique ID.
 */
export const simpleID = (
  seed = 0,
  minLen = 4,
  includeMicroseconds = false,
): () => bigint => {
  if (minLen < 1) {
    throw new Error('Minimum length must be at least 1');
  }

  let currentSeed = seed;
  let dt = new Date();
  let dtno = format(dt, 'yyyyMMdd');
  // Add microsecond component for enhanced uniqueness
  let microTime = includeMicroseconds
    ? performance.now().toString().replace('.', '').padEnd(6, '0').substring(
      0,
      6,
    )
    : '';

  return () => {
    const now = new Date();
    // Reset the date if it's a new day
    if (
      dt.getDate() !== now.getDate() ||
      dt.getMonth() !== now.getMonth() ||
      dt.getFullYear() !== now.getFullYear()
    ) {
      dt = now;
      dtno = format(dt, 'yyyyMMdd');
      currentSeed = 0; // Reset seed
    }

    if (includeMicroseconds) {
      // Update microsecond precision on each call for better uniqueness
      microTime = performance.now().toString().replace('.', '').padEnd(6, '0')
        .substring(0, 6);
    }

    currentSeed++; // Increment after potential reset
    const cnt = String(currentSeed).padStart(minLen, '0');

    // Include microseconds in the ID if requested
    return BigInt(`${dtno}${includeMicroseconds ? microTime : ''}${cnt}`);
  };
};
