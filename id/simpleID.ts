/**
 * @fileoverview Simple Date-Based Sequential ID Generator
 *
 * Generates human-readable sequential IDs based on the current date and an
 * incrementing counter. Perfect for applications requiring date-traceable
 * identifiers like invoices, orders, or daily sequences.
 *
 * @author TundraSoft
 *
 * @example
 * ```typescript
 * import { simpleID } from './simpleID.ts';
 *
 * // Basic daily sequence
 * const dailySeq = simpleID();
 * const id1 = dailySeq(); // 202412260001n (YYYYMMDDNNNN format)
 * const id2 = dailySeq(); // 202412260002n
 *
 * // With microsecond precision
 * const preciseSeq = simpleID(0, 4, true);
 * const preciseId = preciseSeq(); // 20241226123456789012n
 * ```
 */

import { format } from "$datetime";

/**
 * Creates a date-based sequential ID generator.
 *
 * Generates BigInt IDs composed of:
 * - Date component: YYYYMMDD format (8 digits)
 * - Microsecond component: Optional high-precision timestamp (6 digits)
 * - Counter component: Zero-padded incrementing number (configurable length)
 *
 * The counter automatically resets to 0 at the start of each new day,
 * ensuring predictable daily sequences.
 *
 * @param seed - Initial counter value (default: 0)
 * @param minLen - Minimum length of the counter component (default: 4)
 * @param includeMicroseconds - Whether to include microsecond precision (default: false)
 * @returns Generator function that produces date-based sequential IDs
 *
 * @throws {Error} If minLen is less than 1
 *
 * @example
 * ```typescript
 * // Daily invoice numbers (YYYYMMDDNNNN)
 * const invoiceGen = simpleID(1000, 4);
 * const invoice1 = invoiceGen(); // 202412261000n
 * const invoice2 = invoiceGen(); // 202412261001n
 *
 * // Order numbers with longer counter
 * const orderGen = simpleID(0, 6);
 * const order1 = orderGen(); // 20241226000001n
 * const order2 = orderGen(); // 20241226000002n
 *
 * // High-precision timestamps
 * const logGen = simpleID(0, 3, true);
 * const logId = logGen(); // 20241226143052789123n
 * //                         YYYYMMDDHHMMSSΜΜΜCCC
 *
 * // Next day automatically resets counter
 * // (assuming date changes)
 * const nextDayId = invoiceGen(); // 202412270000n (counter reset)
 * ```
 */
export const simpleID = (
  seed = 0,
  minLen = 4,
  includeMicroseconds = false,
): () => bigint => {
  if (minLen < 1) {
    throw new Error("Minimum length must be at least 1");
  }

  let currentSeed = seed;
  let dt = new Date();
  let dtno = format(dt, "yyyyMMdd");

  // Microsecond component for enhanced uniqueness when enabled
  let microTime = includeMicroseconds
    ? performance.now().toString().replace(".", "").padEnd(6, "0").substring(
      0,
      6,
    )
    : "";

  /**
   * Generates the next ID in the daily sequence.
   *
   * @returns A BigInt ID combining date, optional microseconds, and counter
   *
   * @example
   * ```typescript
   * const gen = simpleID(100, 4, false);
   * const id1 = gen(); // 20241226100n
   * const id2 = gen(); // 20241226101n
   * ```
   */
  return () => {
    const now = new Date();

    // Check if we've entered a new day - reset counter if so
    if (
      dt.getDate() !== now.getDate() ||
      dt.getMonth() !== now.getMonth() ||
      dt.getFullYear() !== now.getFullYear()
    ) {
      dt = now;
      dtno = format(dt, "yyyyMMdd");
      currentSeed = 0; // Reset counter for new day
    }

    // Update microsecond precision for each call when enabled
    if (includeMicroseconds) {
      microTime = performance.now().toString().replace(".", "").padEnd(6, "0")
        .substring(0, 6);
    }

    currentSeed++; // Increment counter after potential reset
    const cnt = String(currentSeed).padStart(minLen, "0");

    // Combine components: date + [microseconds] + counter
    return BigInt(`${dtno}${includeMicroseconds ? microTime : ""}${cnt}`);
  };
};
