import { ALPHA_NUMERIC, nanoID } from './nanoID.ts';

/**
 * Generates a unique ID similar to MongoDB's ObjectId.
 *
 * @param {number} counter - An optional counter to ensure uniqueness. Defaults to 0.
 * @param {string} machineId - An optional machine identifier. If not provided, a random ID is generated.
 * @param {number} machineIdLength - Length of the machine ID if auto-generated. Default is 3.
 * @returns {() => string} A function that generates unique IDs.
 */
export function ObjectID(
  counter: number = 0,
  machineId?: string,
  machineIdLength: number = 3,
): () => string {
  if (counter < 0) {
    throw new Error('Counter cannot be negative');
  }

  if (machineIdLength < 1) {
    throw new Error('Machine ID length must be at least 1');
  }

  // Generate machine ID only once and cache it
  const cachedMachineId = machineId || nanoID(machineIdLength, ALPHA_NUMERIC);

  // Cache process ID as it won't change
  const processId = (Deno.pid % 65535).toString(16).padStart(4, '0');

  let currentCounter = counter;

  // For collision resistance, add a worker ID that's unique in the process
  const workerId = nanoID(2, ALPHA_NUMERIC);

  return () => {
    // Increment counter and handle potential overflow
    currentCounter = (currentCounter + 1) % Number.MAX_SAFE_INTEGER;

    // Get current timestamp with higher precision (milliseconds)
    const timestampMs = Date.now();
    const timestamp = Math.floor(timestampMs / 1000);

    // Include millisecond component for better precision
    const milliseconds = (timestampMs % 1000).toString().padStart(3, '0');

    // Format timestamp as 8-character hex string
    const timestampHex = timestamp.toString(16).padStart(8, '0');

    // Format counter as 6-character string (increased from 4)
    const counterStr = currentCounter.toString().padStart(6, '0');

    // Combine components into a string with improved entropy
    return `${timestampHex}${milliseconds}${cachedMachineId}${processId}${workerId}${counterStr}`;
  };
}
