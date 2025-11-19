import type { GuardianTransform } from "../types/mod.ts";
import { GuardianError } from "../GuardianError.ts";

/**
 * Creates a function that checks if a value does not equal an expected value
 *
 * @param expected - The value that should not be matched
 * @param error - Custom error message to throw when validation fails
 * @returns A function that validates inequality
 * @throws {@link GuardianError} if the value equals the expected value
 */
export const notEquals = <T>(
  expected: T,
  error?: string,
): GuardianTransform<T, T> => {
  return (value: T): T => {
    if (value === expected) {
      throw new GuardianError(
        error || "Expected value to not be ${expected}, but got ${got}",
        {
          expected: `not ${expected}`,
          got: value,
          comparison: "notEquals",
          type: "validation",
        },
      );
    }
    return value;
  };
};
