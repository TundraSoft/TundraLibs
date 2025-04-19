import type { FunctionParameters, FunctionType } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';

/**
 * Creates a guardian that validates a value is in a specified array
 *
 * @param expected Array of allowed values
 * @param error Custom error message to throw when validation fails
 * @returns A function that checks if its first argument is in the expected array
 * @throws Error If the expected array is empty or contains undefined values
 * @throws Error {@link GuardianError} if the value is not found in the expected array
 */
export const isIn = <T, P extends FunctionParameters = [T]>(
  expected: T[],
  error?: string,
): FunctionType<T, P> => {
  // Check if array is empty
  if (
    !Array.isArray(expected) || expected.length === 0 ||
    expected.filter((v) => v !== undefined && v !== null).length === 0
  ) {
    throw new Error('Argument "expected" must be a non-empty array');
  }
  // Ensure we only have unique values
  expected = [...new Set(expected)];
  return (...args: P): T => {
    const value = args[0] as T;
    if (!expected.includes(value)) {
      throw new GuardianError(
        {
          got: value,
          expected: expected,
          comparison: 'in',
        },
        error ||
          `Expected value to be in (${expected.join(', ')}), got \${got}`,
      );
    }
    return value;
  };
};
