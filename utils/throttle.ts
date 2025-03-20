// deno-lint-ignore-file no-explicit-any
//#region Compatibility Layer
// Determine the appropriate time function based on the environment
let getCurrentTime: () => number;
if (typeof performance !== 'undefined' && performance.now) {
  getCurrentTime = () => performance.now();
} else {
  getCurrentTime = () => Date.now();
}
//#endregion Compatibility Layer

/**
 * Throttles the provided function, ensuring it's invoked at most once every `delay` milliseconds.
 *
 * @param fn The function to throttle.
 * @param delay The throttling delay in milliseconds.
 * @param ignoreArgs If true, ignores the function arguments when determining throttling.
 * @returns A throttled version of the provided function.
 *
 * @example
 * ```ts
 * // Basic usage
 * const logMessage = (message: string) => {
 *   console.log(`Logged: ${message}`);
 * };
 * const throttledLog = throttle(logMessage, 2000); // Throttle calls to once every 2 seconds
 *
 * throttledLog('First call');  // Executes immediately
 * throttledLog('Second call'); // Ignored
 * throttledLog('Third call');  // Ignored
 *
 * setTimeout(() => throttledLog('Fourth call'), 2500); // Executes after 2.5 seconds
 * ```
 *
 * @example
 * ```ts
 * // Using with asynchronous functions
 * const fetchData = async (url: string): Promise<string> => {
 *   const response = await fetch(url);
 *   return response.text();
 * };
 * const throttledFetchData = throttle(fetchData, 5000); // Throttle calls to once every 5 seconds
 *
 * throttledFetchData('https://api.example.com/data').then(console.log); // Fetches and caches the result
 * throttledFetchData('https://api.example.com/data').then(console.log); // Retrieves the result from the cache
 * ```
 */
export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  ignoreArgs = false,
): T => {
  const callMap: Map<
    string,
    { lastCall: number; returnValue: ReturnType<T> | null; isRunning: boolean }
  > = new Map();

  const update = (argMap: string, callLog: any) => {
    callMap.set(argMap, callLog);
    // setTimeout(() => {
    //   callMap.delete(argMap);
    // }, delay + 1);
  };

  const throttled = function (...args: Parameters<T>): ReturnType<T> {
    const argMap = JSON.stringify(ignoreArgs ? [] : args);
    const callLog = callMap.get(argMap) ||
      { lastCall: 0, returnValue: null, isRunning: false };
    const currentTime = getCurrentTime();
    // Lets re-write without setTimeout
    if (callLog.isRunning === true) {
      return callLog.returnValue as ReturnType<T>;
    } else if (callLog.lastCall > 0 && currentTime - callLog.lastCall < delay) {
      return callLog.returnValue as ReturnType<T>;
    } else if (
      callLog.lastCall > 0 && currentTime - callLog.lastCall >= delay
    ) {
      // Re-run it
      callLog.lastCall = 0;
      callLog.returnValue = null;
    }
    callLog.lastCall = currentTime;
    callLog.returnValue = fn(...args);
    if ((callLog.returnValue as any) instanceof Promise) {
      callLog.isRunning = true;
      (callLog.returnValue as Promise<unknown>).finally(() => {
        callLog.isRunning = false;
        // Update time so that delay is in effect from here
        callLog.lastCall = getCurrentTime();
        // Update...
        update(argMap, callLog);
      });
    }
    update(argMap, callLog);
    return callLog.returnValue as ReturnType<T>;
  };

  return throttled as T;
};

/**
 * A method decorator that throttles the result of the decorated method.
 *
 * @param delay The throttling delay in milliseconds.
 * @param ignoreArgs If true, ignores the function arguments when determining throttling.
 * @returns The updated property descriptor.
 *
 * @example
 * ```ts
 * class Search {
 *   @Throttle(1000) // Throttle calls to once every 1 second
 *   performSearch(query: string) {
 *     console.log(`Searching for: ${query}`);
 *   }
 * }
 *
 * const search = new Search();
 * search.performSearch('TypeScript'); // Executes immediately
 * search.performSearch('JavaScript'); // Ignored
 * search.performSearch('Python');     // Ignored
 *
 * setTimeout(() => search.performSearch('Rust'), 1500); // Executes after 1.5 seconds
 * ```
 */
export const Throttle =
  (delay: number, ignoreArgs = false): MethodDecorator =>
  (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (typeof descriptor.value === 'function') {
      const original = descriptor.value;
      descriptor.value = throttle(original, delay, ignoreArgs);
    }
    return descriptor;
  };
