import type { GuardianTransform } from "../types/mod.ts";
import { GuardianError } from "../GuardianError.ts";
import { isPromiseLike } from "./isPromiseLike.ts";

/**
 * Creates a function that tests a value against a predicate function
 *
 * @param fn - The predicate function to test against
 * @param error - Custom error message to throw when validation fails
 * @param expected - Expected value for error context
 * @returns A function that validates using the predicate
 * @throws {@link GuardianError} if the predicate returns false
 */
export const test = <T>(
  fn: (value: T) => unknown,
  error?: string,
  expected?: unknown,
): GuardianTransform<T, T> => {
  return (value: T): T | Promise<T> => {
    const result = fn(value);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((testResult) => {
        if (!testResult) {
          throw new GuardianError(
            error || "Test validation failed",
            {
              got: value,
              comparison: "test",
              expected,
              type: "validation",
            },
          );
        }
        return value;
      });
    }

    if (!result) {
      throw new GuardianError(
        error || "Test validation failed",
        {
          got: value,
          comparison: "test",
          expected,
          type: "validation",
        },
      );
    }

    return value;
  };
};
