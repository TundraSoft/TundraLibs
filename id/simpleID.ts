import { format } from '$datetime';
/**
 * Generates a sequential ID based on the current date and
 * a seed value. The resulting id is a BigInt which is concatenated
 * date and seed value (padded if required)
 *
 * @param seed number The seed to start with
 * @param minLen number The min length of seed value added to the date
 * @returns A function that generates a unique ID.
 *
 * @example
 * // Basic usage
 * const generateID = simpleID();
 * const id1 = generateID();
 * const id2 = generateID();
 * console.log(id1); // Logs a unique ID based on the current date and a seed value
 * console.log(id2); // Logs another unique ID with incremented seed value
 *
 * @example
 * // Custom seed and minimum length
 * const generateID = simpleID(100, 6);
 * const id1 = generateID();
 * const id2 = generateID();
 * console.log(id1); // Logs a unique ID with seed starting at 100 and minimum length of 6
 * console.log(id2); // Logs another unique ID with incremented seed value
 */
export const simpleID = (seed = 0, minLen = 4): () => bigint => {
  let dt = new Date();
  let dtno = format(dt, 'yyyyMMdd');
  return () => {
    // Reset the date if it's a new day
    if (dt.getDate() !== new Date().getDate()) {
      dt = new Date();
      dtno = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${
        String(dt.getDate()).padStart(2, '0')
      }`;
      seed = 0;
    }
    seed++;
    const cnt = String(seed).padStart(minLen, '0');
    return BigInt(
      `${dtno}${cnt}`,
    );
  };
};
