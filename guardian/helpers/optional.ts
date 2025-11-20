import type { GuardianTransform } from '../types/mod.ts';
import { isPromiseLike } from './isPromiseLike.ts';

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

    // For all other values, call the original guardian
    const result = guardian(value);

    if (isPromiseLike(result)) {
      return result as Promise<T>;
    }

    return result as T;
  };
};
