// deno-lint-ignore-file no-explicit-any
/**
 * @fileoverview Comprehensive memoization utilities for function and method caching.
 *
 * This module provides advanced memoization capabilities for both standalone functions
 * and class methods. It supports asynchronous operations, custom timeouts, and handles
 * edge cases like non-serializable arguments and promise rejection handling.
 *
 * Features:
 * - Function memoization with customizable TTL (Time To Live)
 * - Method decorator for class-based memoization
 * - Async function support with deduplication
 * - Memory management and automatic cache cleanup
 * - Safe handling of non-serializable arguments
 * - TypeScript-first design with full type safety
 */

/**
 * Type for the cached item with expiration metadata.
 *
 * @template T - The type of the cached data
 */
type CachedItem<T> = {
  /** Expiration timestamp in milliseconds since epoch */
  expire: number;
  /** The cached data value */
  data: T;
};

/**
 * Creates a safe cache key from function arguments.
 *
 * This function attempts to create a deterministic string representation of the
 * function arguments for use as a cache key. It handles edge cases where arguments
 * cannot be serialized (circular references, functions, etc.) or where serialization
 * produces non-unique results by falling back to a time-based unique identifier.
 *
 * @template T - Array type of the function arguments
 * @param args - Function arguments to create key from
 * @returns A string representation suitable for use as a cache key
 *
 * @example
 * ```typescript
 * createCacheKey([1, 2, "hello"]); // '[1,2,"hello"]'
 * createCacheKey([{ a: 1 }, [1, 2]]); // '[{"a":1},[1,2]]'
 *
 * // Handles circular references gracefully
 * const circular = { a: 1 };
 * circular.self = circular;
 * createCacheKey([circular]); // Falls back to unique timestamp-based key
 *
 * // Handles functions gracefully
 * const func = () => 'test';
 * createCacheKey([func]); // Falls back to unique timestamp-based key
 * ```
 */
const createCacheKey = <T extends Array<unknown>>(args: T): string => {
  try {
    // Check if any argument is a function or other non-serializable type
    const hasNonSerializable = args.some((arg) =>
      typeof arg === 'function' ||
      typeof arg === 'symbol' ||
      typeof arg === 'undefined'
    );

    if (hasNonSerializable) {
      // Use fallback for non-serializable arguments
      return `non_serializable_${Date.now()}_${Math.random()}`;
    }

    const stringified = JSON.stringify(args);

    // Check if JSON.stringify converted something to null that shouldn't be
    if (stringified.includes('null') && !args.some((arg) => arg === null)) {
      // JSON.stringify converted non-null values to null, use fallback
      return `non_serializable_${Date.now()}_${Math.random()}`;
    }

    return stringified;
  } catch (_error) {
    // If arguments can't be stringified (circular refs, etc.),
    // use a fallback approach with timestamp and random component
    // This ensures we don't cache non-serializable arguments incorrectly
    return `non_serializable_${Date.now()}_${Math.random()}`;
  }
};

/**
 * Memoizes the provided function by caching its return values for the same set of arguments.
 *
 * @param fn The function to cache.
 * @param timeout The cache timeout in seconds. Default is 30 minutes.
 * @returns A memoized version of the provided function.
 *
 * @example
 * ```ts
 * // Basic usage
 * const add = (a: number, b: number): number => a + b;
 * const memoizedAdd = memoize(add, 60); // Cache results for 60 seconds
 *
 * console.log(memoizedAdd(1, 2)); // Computes and caches the result
 * console.log(memoizedAdd(1, 2)); // Retrieves the result from the cache
 *
 * // Using with asynchronous functions
 * const fetchData = async (url: string): Promise<string> => {
 *   const response = await fetch(url);
 *   return response.text();
 * };
 * const memoizedFetchData = memoize(fetchData, 120); // Cache results for 120 seconds
 *
 * memoizedFetchData('https://api.example.com/data').then(console.log); // Fetches and caches the result
 * memoizedFetchData('https://api.example.com/data').then(console.log); // Retrieves the result from the cache
 * ```
 */
export const memoize = <T extends (...args: any[]) => any>(
  fn: T,
  timeout: number = 30 * 60,
): T => {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function');
  }

  // Ensure timeout is a positive number
  const cacheTimeout = Math.max(0, timeout) * 1000;

  const cache = new Map<string, CachedItem<ReturnType<T>>>();
  // For tracking in-flight promises
  const pendingPromises = new Map<string, Promise<any>>();

  const memoizedFn = ((...args: Parameters<T>): ReturnType<T> => {
    const key = createCacheKey(args);
    const now = Date.now();

    // Check if we have a valid cached value
    const cachedValue = cache.get(key);
    if (cachedValue && cachedValue.expire > now) {
      return cachedValue.data;
    }

    // If expired, remove from cache
    if (cachedValue) {
      cache.delete(key);
    }

    // For async functions, check if there's already a pending promise
    if (pendingPromises.has(key)) {
      return pendingPromises.get(key) as ReturnType<T>;
    }

    try {
      // Call the original function
      const result = fn(...args);

      // Handle promises specially
      if (result instanceof Promise) {
        // Save the promise in the pendingPromises map
        pendingPromises.set(key, result);

        // For async functions, return a new promise
        return Promise.resolve(result)
          .then((resolvedValue) => {
            // Only cache successful promises
            cache.set(key, {
              data: resolvedValue as ReturnType<T>,
              expire: now + cacheTimeout,
            });
            // Remove from pending promises
            pendingPromises.delete(key);
            return resolvedValue;
          })
          .catch((error) => {
            // Don't cache errors and remove from pending
            pendingPromises.delete(key);
            throw error;
          }) as ReturnType<T>;
      }

      // For synchronous functions, cache immediately
      cache.set(key, {
        data: result as ReturnType<T>,
        expire: now + cacheTimeout,
      });
      return result as ReturnType<T>;
    } catch (error) {
      // Don't cache errors
      throw error;
    }
  }) as T;

  return memoizedFn;
};

/**
 * A method decorator that memoizes the result of the decorated method.
 *
 * @param timeout The cache timeout in seconds. Default is 30 minutes.
 * @returns The updated property descriptor.
 *
 * @example
 * ```ts
 * class Calculator {
 *   @Memoize(60) // Cache results for 60 seconds
 *   add(a: number, b: number): number {
 *     return a + b;
 *   }
 * }
 *
 * const calc = new Calculator();
 * console.log(calc.add(1, 2)); // Computes and caches the result
 * console.log(calc.add(1, 2)); // Retrieves the result from the cache
 * ```
 */
export function Memoize(timeout: number = 30 * 60): MethodDecorator {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (typeof descriptor.value === 'function') {
      // For normal methods
      const originalMethod = descriptor.value;

      // Create a new descriptor value that preserves the 'this' context
      descriptor.value = function (this: any, ...args: any[]) {
        // Create a unique key for this instance
        const instanceKey = this && this.constructor
          ? `${this.constructor.name}_${propertyKey.toString()}`
          : propertyKey.toString();

        // Create a unique memoized function for this instance if it doesn't exist
        if (!this.__memoized) {
          this.__memoized = new Map();
        }

        if (!this.__memoized.has(instanceKey)) {
          this.__memoized.set(
            instanceKey,
            memoize(
              (...args: any[]) => originalMethod.apply(this, args),
              timeout,
            ),
          );
        }

        // Call the memoized function
        return this.__memoized.get(instanceKey)(...args);
      };
    } else if (typeof descriptor.get === 'function') {
      // For getters
      const originalGetter = descriptor.get;

      descriptor.get = function (this: any) {
        // Create a unique key for this instance and getter
        const instanceKey = this && this.constructor
          ? `${this.constructor.name}_get_${propertyKey.toString()}`
          : `get_${propertyKey.toString()}`;

        // Create a unique memoized function for this instance if it doesn't exist
        if (!this.__memoized) {
          this.__memoized = new Map();
        }

        if (!this.__memoized.has(instanceKey)) {
          this.__memoized.set(
            instanceKey,
            memoize(() => originalGetter.apply(this), timeout),
          );
        }

        // Call the memoized getter
        return this.__memoized.get(instanceKey)();
      };
    }

    return descriptor;
  };
}
