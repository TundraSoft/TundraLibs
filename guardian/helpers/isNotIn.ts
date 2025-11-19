import type { GuardianTransform } from "../types/mod.ts";
import { GuardianError } from "../GuardianError.ts";

/**
 * Creates a guardian that validates a value is not in a specified array
 *
 * @param expected - Array of disallowed values
 * @param error - Custom error message to throw when validation fails
 * @returns A function that checks if the value is not in the expected array
 * @throws Error if the expected array is empty
 * @throws {@link GuardianError} if the value is found in the expected array
 */
export const isNotIn = <T>(
  expected: T[],
  error?: string,
): GuardianTransform<T, T> => {
  // Check if array is empty
  if (!Array.isArray(expected) || expected.length === 0) {
    throw new Error('Argument "expected" must be a non-empty array');
  }

  // Ensure we only have unique values
  const uniqueExpected = [...new Set(expected)];

  return (value: T): T => {
    if (uniqueExpected.includes(value)) {
      throw new GuardianError(
        error ||
          `Expected value to not be in (${
            uniqueExpected.join(", ")
          }), got \${got}`,
        {
          got: value,
          expected: `not in (${uniqueExpected.join(", ")})`,
          comparison: "notIn",
          type: "validation",
        },
      );
    }
    return value;
  };
};
