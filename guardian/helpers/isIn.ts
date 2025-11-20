import type { GuardianTransform } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';

/**
 * Creates a guardian that validates a value is in a specified array
 *
 * @param expected - Array of allowed values
 * @param error - Custom error message to throw when validation fails
 * @returns A function that checks if the value is in the expected array
 * @throws Error if the expected array is empty or contains undefined values
 * @throws {@link GuardianError} if the value is not found in the expected array
 */
export const isIn = <T>(
  expected: T[],
  error?: string,
): GuardianTransform<T, T> => {
  // Check if array is empty
  if (
    !Array.isArray(expected) || expected.length === 0 ||
    expected.filter((v) => v !== undefined && v !== null).length === 0
  ) {
    throw new Error('Argument "expected" must be a non-empty array');
  }

  // Ensure we only have unique values
  const uniqueExpected = [...new Set(expected)];

  return (value: T): T => {
    if (!uniqueExpected.includes(value)) {
      throw new GuardianError(
        error ||
          `Expected value to be in (${
            uniqueExpected.join(', ')
          }), got ${value}`,
        {
          got: value,
          expected: uniqueExpected,
          comparison: 'in',
          type: 'validation',
        },
      );
    }
    return value;
  };
};
