import { ALPHA_NUMERIC, nanoID } from './nanoID.ts';

/**
 * Generates a unique ID similar to MongoDB's ObjectId.
 *
 * @param {number} counter - An optional counter to ensure uniqueness. Defaults to 0 if not provided.
 * @param {string} machineId - An optional machine identifier. If not provided, a random 3-character ID is generated.
 * @returns {() => string} A function that generates unique IDs.
 *
 * @example
 * // Basic usage
 * const generateID = ObjectID();
 * const id1 = generateID();
 * const id2 = generateID();
 * console.log(id1); // Logs a unique ID similar to MongoDB's ObjectId
 * console.log(id2); // Logs another unique ID
 *
 * @example
 * // Custom machine ID
 * const generateID = ObjectID(0, 'abc');
 * const id1 = generateID();
 * const id2 = generateID();
 * console.log(id1); // Logs a unique ID with 'abc' as the machine ID
 * console.log(id2); // Logs another unique ID with 'abc' as the machine ID
 */
export function ObjectID(
  counter: number = 0,
  machineId?: string,
): () => string {
  machineId = machineId || nanoID(3, ALPHA_NUMERIC);
  const processId = (Deno.pid % 65535).toString(16);
  return () => {
    counter++;
    const timestamp = Math.floor(Date.now() / 1000);
    // Combine the components into a string
    return `${timestamp.toString(16)}${machineId}${processId}${counter}`;
  };
}
