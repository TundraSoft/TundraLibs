import { FunctionParameters, FunctionType } from '../types/mod.ts';

import { makeError } from '../error/mod.ts';

/**
 * equals
 *
 * Checks if the data is equal to the expected value.
 *
 * @param expected T The expected value
 * @param error string Message to show when the value is not valid
 * @returns FunctionType<T> The function
 */
export function equals<T, P extends FunctionParameters = [T]>(
  expected: T,
  error?: string,
): FunctionType<T, P> {
  return (...args: P): T => {
    if (args[0] !== expected) {
      throw makeError(
        error || `Expect array length to be ${expected}`,
      );
    }
    return args[0] as T;
  };
}
