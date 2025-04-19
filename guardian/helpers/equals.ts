import type { FunctionType } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';

/**
 * Creates a function that checks if a value equals an expected value
 *
 * @param expected The expected value to compare against
 * @param error Custom error message to throw when validation fails
 * @returns A function that validates equality
 * @throws Error {@link GuardianError} if the value is not equal to the expected value
 */
export const equals = <T>(
  expected: T,
  error?: string,
): FunctionType<T, [T]> => {
  return (value: T): T => {
    if (value !== expected) {
      throw new GuardianError({
        expected: expected,
        got: value,
        comparison: 'equals',
      }, error || 'Expected value to be ${expected}, but got ${got}');
    }
    return value;
  };
};

// const obj = { test: 1 };
// try {
//   const objTest = equals('12');
//   objTest();
// } catch (e) {
//   console.log(e);
// }
