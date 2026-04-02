import type { FunctionType, MergeParameters } from "../types/mod.ts";
import { GuardianError } from "../GuardianError.ts";
import { isPromiseLike } from "./isPromiseLike.ts";

/**
 * Wraps a guardian function to handle undefined first arguments.
 *
 * @param guardian The function to wrap
 * @param defaultValue The value to return when the first argument is undefined
 * @returns A function that returns either the result of the guardian or the default value
 * @throws Error {@link GuardianError} If the default value is a function and it throws an error or if downstream guardian throws an error
 */
export const optional = <F extends FunctionType, R = undefined>(
  guardian: F,
  defaultValue?: R | (() => R | Promise<R>),
): FunctionType<
  ReturnType<F> | R | Promise<ReturnType<F> | R>,
  MergeParameters<Parameters<F> | [undefined?]>
> => {
  return (
    ...args: MergeParameters<Parameters<F> | [undefined?]>
  ): ReturnType<F> | R | Promise<ReturnType<F> | R> => {
    try {
      // Handle undefined - always short-circuit if no default value
      if (args[0] === undefined) {
        if (defaultValue !== undefined) {
          // We have a default value, use it
          if (typeof defaultValue === "function") {
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
                    comparison: "optional",
                    generatorError: (error as Error).message,
                  },
                  "Error generating default value: ${generatorError}",
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

      // For all other values (including null), call the guardian
      return guardian(...args);
    } catch (error) {
      if (error instanceof GuardianError) {
        throw error;
      } else {
        // Its an unknown error!!!
        throw new GuardianError(
          {
            got: args[0],
            comparison: "optional",
          },
          "Error while validating optional value - ${got}",
        );
      }
    }
  };
};
