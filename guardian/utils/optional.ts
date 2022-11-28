import { FunctionType, MergeParameters } from '../types/mod.ts';

export function optional<F extends FunctionType, R = undefined>(
  guardian: F,
  defaultValue?: R,
): FunctionType<
  ReturnType<F> | R,
  MergeParameters<Parameters<F> | [(undefined | null)?]>
> {
  return (
    ...args: MergeParameters<Parameters<F> | [(undefined | null)?]>
  ): ReturnType<F> | R => {
    if (args[0] == null || args[0] === '') {
      return defaultValue as R;
    }
    return guardian(...args);
  };
}
