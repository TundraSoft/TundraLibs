import type { GuardianTransform } from "../types/mod.ts";

/**
 * Creates a function that allows null values to pass through
 *
 * @param guardian - The original guardian function to make nullable
 * @returns A function that handles null values by returning null
 */
export const nullable = <F extends GuardianTransform<unknown, T>, T>(
  guardian: F,
): GuardianTransform<unknown, T | null> => {
  return (value: unknown): T | null => {
    // Handle null - return null without calling guardian
    if (value === null) {
      return null;
    }

    // Handle undefined (missing key) - return null as default
    if (value === undefined) {
      return null;
    }

    // For all other values, call the original guardian
    return guardian(value) as T;
  };
};
