import { nanoId } from './nanoId.ts';
import { alphaNumeric } from './const/mod.ts';

/**
 * Generates a unique ID similar to MongoDB's ObjectId.
 *
 * @returns {string} The generated ID.
 */
export function ObjectId(
  counter: number = 0,
  machineId?: string,
): () => string {
  machineId = machineId || nanoId(3, alphaNumeric);
  const processId = (Deno.pid % 65535).toString(16);
  return () => {
    counter++;
    const timestamp = Math.floor(Date.now() / 1000);
    // Combine the components into a string
    return `${timestamp.toString(16)}${machineId}${processId}${counter}`;
  };
}
