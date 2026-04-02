import type { FunctionType, MergeParameters } from "../types/mod.ts";
import { GuardianError } from "../GuardianError.ts";

/**
 * Wraps a guardian function to handle null first arguments.
 * When the first argument is null, it returns null without calling the guardian.
 * For all other values, it calls the original guardian function.
 *
 * @param guardian The function to wrap
 * @returns A function that returns either the result of the guardian or null
 * @throws Error {@link GuardianError} If the guardian throws an error for non-null values
 */
export const nullable = <F extends FunctionType>(
  guardian: F,
): FunctionType<
  ReturnType<F> | null | Promise<ReturnType<F> | null>,
  MergeParameters<Parameters<F> | [null?]>
> => {
  return (
    ...args: MergeParameters<Parameters<F> | [null?]>
  ): ReturnType<F> | null | Promise<ReturnType<F> | null> => {
    try {
      // Handle null - return null without calling guardian
      if (args[0] === null) {
        return null;
      }

      // For all other values, call the guardian
      return guardian(...args);
    } catch (error) {
      if (error instanceof GuardianError) {
        throw error;
      } else {
        // Unknown error
        throw new GuardianError(
          {
            got: args[0],
            comparison: "nullable",
          },
          "Error while validating nullable value - ${got}",
        );
      }
    }
  };
};
