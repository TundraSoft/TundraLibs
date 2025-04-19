import type { FunctionParameters, FunctionType } from '../types/mod.ts';

export const oneOf = <T, P extends FunctionParameters = [T]>(
  expected: T[],
  error?: string,
): FunctionType<T, P> => {
  return (...args: P): T => {
    if (!expected.includes(args[0] as T)) {
      throw new Error(
        error || `Expect value to be one of ${expected.join(', ')}`,
      );
    }
    return args[0] as T;
  };
};
