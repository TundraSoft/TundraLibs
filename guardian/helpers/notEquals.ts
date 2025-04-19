import type { FunctionType } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';

/**
 * Creates a function that checks if a value does not equal an expected value
 *
 * @param expected The value to compare against
 * @param error Custom error message to throw when validation fails
 * @returns A function that validates inequality
 * @throws Error {@link GuardianError} if the value is not equal to the expected value
 */
export const notEquals = <T>(
  expected: T,
  error?: string,
): FunctionType<T, [T]> => {
  return (value: T): T => {
    if (value === expected) {
      throw new GuardianError(
        {
          got: value,
          expected: expected,
          comparison: 'notEquals',
        },
        error ||
          'Expected value to not be ${expected}, but got ${got}',
      );
    }
    return value;
  };
};
