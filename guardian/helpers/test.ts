import type { FunctionType } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';
import { isPromiseLike } from './isPromiseLike.ts';

/**
 * Creates a function that tests a value against a predicate function
 *
 * @param fn The predicate function to test against
 * @param error Custom error message to throw when validation fails
 * @returns A function that validates using the predicate
 * @throws Error {@link GuardianError} if the predicate returns false
 */
export const test = <T>(
  fn: FunctionType<unknown, [T]>,
  error?: string,
  expected?: unknown,
): FunctionType<T | Promise<T>, [T]> => {
  return (value: T) => {
    const result = fn(value);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((testResult) => {
        if (!testResult) {
          throw new GuardianError({
            got: value,
            comparison: 'test',
            expected,
          }, error);
        }
        return value;
      });
    }

    if (!result) {
      throw new GuardianError({
        got: value,
        comparison: 'test',
        expected,
      }, error);
    }

    return value;
  };
};
