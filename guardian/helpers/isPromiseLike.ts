/**
 * Checks if a given value is promise-like (thenable) or an async function.
 *
 * A value is considered promise-like if:
 * - It's an object with a callable `then` method (thenable)
 * - It's an async function (which returns a Promise when called)
 *
 * This follows the Promises/A+ specification for thenable detection and extends
 * it to include async functions for practical async/await compatibility.
 *
 * @param value - The value to check if it is promise-like or async function
 * @returns True if the value is promise-like or an async function, false otherwise
 *
 * @example
 * ```ts
 * // Native Promises
 * isPromiseLike(Promise.resolve()) // true
 * isPromiseLike(Promise.reject().catch(() => {})) // true
 *
 * // Thenable objects
 * isPromiseLike({ then: () => {} }) // true
 * isPromiseLike({ then: (resolve, reject) => resolve(42) }) // true
 *
 * // Async functions
 * isPromiseLike(async () => {}) // true
 * isPromiseLike(async function() {}) // true
 *
 * // Non-promise-like values
 * isPromiseLike({}) // false
 * isPromiseLike(() => {}) // false (regular function)
 * isPromiseLike({ then: 'not a function' }) // false
 * isPromiseLike(null) // false
 * isPromiseLike(undefined) // false
 * ```
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (!value) return false;

  // Check if it's a thenable (has a callable 'then' method)
  if (
    typeof value === "object" &&
    typeof (value as PromiseLike<unknown>).then === "function"
  ) {
    return true;
  }

  // Check if it's an async function
  if (typeof value === "function") {
    // Constructor name check - covers most cases including minified code recovery
    if (value.constructor?.name === "AsyncFunction") {
      return true;
    }

    // toString() check - if someone fakes it as async, treat it as async
    try {
      const fnString = value.toString();
      if (/^\s*async\s/.test(fnString)) {
        return true;
      }
    } catch {
      // toString() might fail, that's okay
    }
  }

  return false;
}
