import { FunctionParameters, FunctionType } from "../types/mod.ts";
import { makeError } from "../error/mod.ts";
/**
 * array
 *
 * Builds a generic validator to confirm if the value is an array.
 *
 * @param len number | null The expected length of the array
 * @param error string Message to show when the length is not valid
 * @returns FunctionType<Array<unknown>, FunctionParameters> The array validator
 */
export function array<
  R extends Array<unknown>,
  P extends FunctionParameters = [R],
>(len: number | null = null, error?: string): FunctionType<R, P> {
  const isArray = (...args: P): R => {
    if (!Array.isArray(args[0])) {
      throw makeError(error || `Expect value to be an array`);
    }
    return args[0] as R;
  };

  if (len === null) {
    return isArray;
  }

  return (...args: P): R => {
    const arr = isArray(...args);

    if (arr.length !== len) {
      throw makeError(error || `Expect array length to be ${len}`);
    }
    return arr;
  };
}
