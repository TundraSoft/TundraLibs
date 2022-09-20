import { FunctionParameters, FunctionType } from "../types/mod.ts";

import { makeError } from "../error/mod.ts";

/**
 * oneOf
 *
 * Check if the value of the item is one of the expected values.
 *
 * @param expected T[] List of items to check if the value is included in the list
 * @param error string Message to show when the value is not valid
 * @returns FunctionType<T, P> Function to check if value is in list
 */
export function oneOf<T, P extends FunctionParameters = [T]>(
  expected: T[],
  error?: string,
): FunctionType<T, P> {
  return (...args: P): T => {
    if (!expected.includes(args[0] as T)) {
      throw makeError(
        error || `Expect value to be one of ${expected.join(", ")}`,
      );
    }
    return args[0] as T;
  };
}
