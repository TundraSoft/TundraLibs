import type { GuardianTransform } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';

/**
 * Creates a function that checks if a value equals an expected value
 *
 * @param expected - The expected value to compare against
 * @param error - Custom error message to throw when validation fails
 * @returns A function that validates equality
 * @throws {@link GuardianError} if the value is not equal to the expected value
 */
export const equals = <T>(
  expected: T,
  error?: string,
): GuardianTransform<T, T> => {
  return (value: T): T => {
    if (value !== expected) {
      throw new GuardianError(
        error || `Expected value to be ${expected}, but got ${value}`,
        {
          expected: expected,
          got: value,
          comparison: 'equals',
          type: 'validation',
        },
      );
    }
    return value;
  };
};
