/**
 * @fileoverview MongoDB-Style ObjectID Generator
 *
 * Generates unique identifiers similar to MongoDB's ObjectId format, providing
 * a distributed-friendly ID generation system that embeds timestamp, machine,
 * process, and counter information for enhanced uniqueness and traceability.
 *
 * @author TundraSoft
 *
 * @example
 * ```typescript
 * import { ObjectID } from './ObjectID.ts';
 *
 * // Create an ObjectID generator with default settings
 * const generateId = ObjectID();
 * const id1 = generateId(); // "507f1f77bcf86cd799439011abc123"
 * const id2 = generateId(); // "507f1f77bcf86cd799439011abc124"
 *
 * // Create with custom counter and machine ID
 * const customGen = ObjectID(1000, "srv01");
 * const customId = customGen(); // Uses "srv01" as machine identifier
 * ```
 */

import { ALPHA_NUMERIC, nanoID } from "./nanoID.ts";

/**
 * Creates a MongoDB-style ObjectID generator function.
 *
 * ObjectIDs are 24-character hexadecimal strings composed of:
 * - 8 chars: Unix timestamp (seconds since epoch)
 * - 3 chars: Millisecond component for enhanced precision
 * - 3 chars: Machine identifier (auto-generated or provided)
 * - 4 chars: Process identifier (derived from Deno.pid)
 * - 2 chars: Worker identifier (random, for collision resistance)
 * - 6 chars: Incrementing counter (padded with zeros)
 *
 * @param counter - Initial counter value for uniqueness (default: 0)
 * @param machineId - Machine identifier string. If not provided, auto-generated
 * @param machineIdLength - Length of auto-generated machine ID (default: 3)
 * @returns A function that generates unique ObjectID strings
 *
 * @throws {Error} If counter is negative
 * @throws {Error} If machineIdLength is less than 1
 *
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const genId = ObjectID();
 * const id1 = genId(); // "65a1b2c3d4e5f67890abcdef123456"
 *
 * // Custom counter and machine ID
 * const serverGen = ObjectID(5000, "web01");
 * const serverId = serverGen(); // Uses "web01" as machine identifier
 *
 * // Auto-generated machine ID with custom length
 * const longMachineGen = ObjectID(0, undefined, 5);
 * const longId = longMachineGen(); // Uses 5-character machine ID
 * ```
 */
export function ObjectID(
  counter: number = 0,
  machineId?: string,
  machineIdLength: number = 3,
): () => string {
  if (counter < 0) {
    throw new Error("Counter cannot be negative");
  }

  if (machineIdLength < 1) {
    throw new Error("Machine ID length must be at least 1");
  }

  // Generate machine ID only once and cache it
  const cachedMachineId = machineId || nanoID(machineIdLength, ALPHA_NUMERIC);

  // Cache process ID as it won't change
  const processId = (Deno.pid % 65535).toString(16).padStart(4, "0");

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
    const milliseconds = (timestampMs % 1000).toString().padStart(3, "0");

    // Format timestamp as 8-character hex string
    const timestampHex = timestamp.toString(16).padStart(8, "0");

    // Format counter as 6-character string (increased from 4)
    const counterStr = currentCounter.toString().padStart(6, "0");

    // Combine components into a string with improved entropy
    return `${timestampHex}${milliseconds}${cachedMachineId}${processId}${workerId}${counterStr}`;
  };
}
