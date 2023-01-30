import { FunctionParameters, FunctionType } from '../types/mod.ts';

import { makeError } from '../error/mod.ts';
/**
 * test
 *
 * Wrapper for generic testing.
 *
 * @param fn FunctionType<T, P> The function to call
 * @param error string Message to show when the value is not valid
 * @returns FunctionType The function
 */
export function test<P extends FunctionParameters>(
  fn: FunctionType<unknown, P>,
  error?: string,
): FunctionType<P[0], P> {
  return (...args: P): unknown => {
    if (!fn(...args)) {
      throw makeError(error || `Validation test failed`);
    }
    return args[0];
  };
}
