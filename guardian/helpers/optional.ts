import type { FunctionType, MergeParameters } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';
import { isPromiseLike } from './isPromiseLike.ts';

/**
 * Options for controlling optional behavior
 */
export interface OptionalOptions {
  /**
   * Whether to treat null values the same as undefined values
   * When true (default), both null and undefined trigger default value behavior
   * When false, only undefined triggers default value behavior, null passes through to guardian
   */
  treatNullAsUndefined?: boolean;
}

// type DefaultFunction<R> = (() => R | Promise<R>) | R;
/**
 * Wraps a guardian function to handle undefined or null first arguments.
 *
 * @param guardian The function to wrap
 * @param defaultValue The value to return when the first argument is undefined or null
 * @param options Options for controlling null handling behavior
 * @returns A function that returns either the result of the guardian or the default value
 * @throws Error {@link GuardianError} If the default value is a function and it throws an error or if downstream guardian throws an error
 */
export const optional = <F extends FunctionType, R = undefined>(
  guardian: F,
  defaultValue?: R | (() => R | Promise<R>),
  options: OptionalOptions = {},
): FunctionType<
  ReturnType<F> | R | Promise<ReturnType<F> | R>,
  MergeParameters<Parameters<F> | [(undefined | null)?]>
> => {
  const { treatNullAsUndefined = true } = options;

  return (
    ...args: MergeParameters<Parameters<F> | [(undefined | null)?]>
  ): ReturnType<F> | R | Promise<ReturnType<F> | R> => {
    try {
      // Handle undefined - always short-circuit if no default value
      if (args[0] === undefined) {
        if (defaultValue !== undefined) {
          // We have a default value, use it
          if (typeof defaultValue === 'function') {
            const result = (defaultValue as () => R | Promise<R>)();
            if (isPromiseLike(result)) {
              return (result as Promise<R>).then((resolvedValue) => {
                args[0] = resolvedValue;
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
            }
            args[0] = result;
            return guardian(...args);
          } else {
            args[0] = defaultValue;
            return guardian(...args);
          }
        } else {
          // No default value, return undefined as-is
          return args[0] as ReturnType<F>;
        }
      }

      // Handle null based on treatNullAsUndefined option
      if (args[0] === null) {
        if (treatNullAsUndefined) {
          // Treat null like undefined
          if (defaultValue !== undefined) {
            // We have a default value, use it
            if (typeof defaultValue === 'function') {
              const result = (defaultValue as () => R | Promise<R>)();
              if (isPromiseLike(result)) {
                return (result as Promise<R>).then((resolvedValue) => {
                  args[0] = resolvedValue;
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
              }
              args[0] = result;
              return guardian(...args);
            } else {
              args[0] = defaultValue;
              return guardian(...args);
            }
          } else {
            // No default value, return undefined (converted from null)
            return undefined as ReturnType<F>;
          }
        } else {
          // Don't treat null as undefined, pass through to guardian
          return guardian(...args);
        }
      }

      // For all other values, call the guardian
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
