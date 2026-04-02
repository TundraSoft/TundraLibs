import type { FunctionType, MergeParameters } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';
import { isPromiseLike } from './isPromiseLike.ts';

// type DefaultFunction<R> = (() => R | Promise<R>) | R;
/**
 * Wraps a guardian function to handle undefined or null first arguments.
 *
 * @param guardian The function to wrap
 * @param defaultValue The value to return when the first argument is undefined or null
 * @returns A function that returns either the result of the guardian or the default value
 * @throws Error {@link GuardianError} If the default value is a function and it throws an error or if downstream guardian throws an error
 */
export const optional = <F extends FunctionType, R = undefined>(
  guardian: F,
  defaultValue?: R | (() => R | Promise<R>),
): FunctionType<
  ReturnType<F> | R | Promise<ReturnType<F> | R>,
  MergeParameters<Parameters<F> | [(undefined | null)?]>
> => {
  return (
    ...args: MergeParameters<Parameters<F> | [(undefined | null)?]>
  ): ReturnType<F> | R | Promise<ReturnType<F> | R> => {
    try {
      // if default is present, we set it to the first argument if it is undefined or null
      if ((args[0] === undefined || args[0] === null) && defaultValue) {
        if (typeof defaultValue === 'function') {
          const result = (defaultValue as () => R | Promise<R>)();
          if (isPromiseLike(result)) {
            // Return a Promise that resolves to the final result
            return (result as Promise<R>).then((resolvedValue) => {
              args[0] = resolvedValue;
              // Double check if the first argument is undefined or null
              if (args[0] === undefined || args[0] === null) {
                return args[0] as R;
              }
              return guardian(...args);
            }).catch((error) => {
              throw new GuardianError(
                {
                  got: args[0],
                  expected: defaultValue,
                  comparison: 'optional',
                  generatorError: (error as Error).message,
                },
                'Error generating default value: ${generatorError}',
              );
            });
          } else {
            args[0] = result as R;
          }
        } else {
          args[0] = defaultValue as R;
        }
      }
    } catch (error) {
      throw new GuardianError(
        {
          got: args[0],
          expected: defaultValue,
          comparison: 'optional',
          generatorError: (error as Error).message,
        },
        'Error generating default value: ${generatorError}',
      );
    }
    try {
      // Double check if the first argument is undefined or null
      if (args[0] === undefined || args[0] === null) {
        return args[0] as R;
      }
      return guardian(...args);
    } catch (error) {
      if (error instanceof GuardianError) {
        throw error;
      } else {
        // Its an unknown error!!!
        throw new GuardianError(
          {
            got: args[0],
            comparison: 'optional',
          },
          'Error while validating optional value - ${got}',
        );
      }
    }
  };
};
