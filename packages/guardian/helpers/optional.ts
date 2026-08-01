import type { GuardianTransform } from '../types/mod.ts';

/**
 * Creates a function that makes a guardian optional with a default value
 *
 * @param guardian - The original guardian function to make optional
 * @param defaultValue - Default value or function that returns default value
 * @returns A function that handles undefined values with defaults
 */
export const optional = <
  F extends GuardianTransform<unknown, T>,
  T,
  R = undefined,
>(
  guardian: F,
  defaultValue?: R | (() => R),
): GuardianTransform<unknown, T | R> => {
  return (value: unknown): T | R | Promise<T | R> => {
    // Handle undefined by returning default
    if (value === undefined) {
      if (defaultValue === undefined) {
        return undefined as R;
      }

      if (typeof defaultValue === 'function') {
        const result = (defaultValue as () => R)();
        return result;
      }

      return defaultValue;
    }

    // For all other values, call the original guardian. Its result —
    // whether a plain value or a genuine `Promise` from an async
    // guardian — is returned unchanged; the thenable-adoption gate for
    // async chains lives at each value-adoption site in the guards, not
    // here (this helper never awaits/adopts, it only forwards).
    return guardian(value);
  };
};
