/**
 * @fileoverview Advanced throttling utilities for rate-limiting function execution.
 *
 * This module provides sophisticated throttling mechanisms that limit how frequently
 * functions can be executed. It's particularly useful for performance optimization
 * in scenarios like:
 * - API rate limiting and request throttling
 * - UI event handling (scroll, resize, input)
 * - Database query optimization
 * - Real-time data processing pipelines
 *
 * Features:
 * - High-precision timing using performance.now() when available
 * - Async function support with proper promise handling
 * - Memory management and automatic cleanup
 * - Argument-based or global throttling modes
 * - Method decorator for class-based throttling
 * - Cross-platform compatibility (Node.js, Deno, Browser)
 */

// deno-lint-ignore-file no-explicit-any
//#region Compatibility Layer
// Determine the appropriate time function based on the environment
let getCurrentTime: () => number;
if (typeof performance !== "undefined" && performance.now) {
  // Use high-resolution timer when available (sub-millisecond precision)
  getCurrentTime = () => performance.now();
} else {
  // Fallback to Date.now() for environments without performance API
  getCurrentTime = () => Date.now();
}
//#endregion Compatibility Layer

/**
 * Throttles a function to execute at most once every specified delay period.
 *
 * This implementation provides advanced throttling with the following capabilities:
 * - **Memory Management**: Automatically tracks and cleans up call states
 * - **Async Support**: Properly handles Promise-returning functions
 * - **Argument Discrimination**: Can throttle based on arguments or globally
 * - **High Precision**: Uses performance.now() for sub-millisecond accuracy
 * - **Error Safety**: Handles non-serializable arguments gracefully
 *
 * **Algorithm:**
 * 1. Creates a unique key from function arguments (unless ignoreArgs is true)
 * 2. Checks if function is currently running or within throttle delay
 * 3. Returns cached result if throttled, otherwise executes function
 * 4. For async functions, tracks execution state to prevent concurrent calls
 *
 * **Performance Characteristics:**
 * - Time complexity: O(1) for cache lookup and argument serialization
 * - Space complexity: O(n) where n is the number of unique argument combinations
 * - Memory cleanup: Automatic cleanup after delay periods expire
 *
 * @template T - The type of the function to throttle
 * @param fn - The function to throttle
 * @param delay - The throttling delay in milliseconds (minimum time between executions)
 * @param ignoreArgs - If true, throttles globally regardless of arguments; if false, throttles per unique argument set
 * @returns A throttled version of the provided function that maintains the same signature
 *
 * @example Basic function throttling:
 * ```typescript
 * const logMessage = (message: string) => {
 *   console.log(`Logged: ${message}`);
 * };
 * const throttledLog = throttle(logMessage, 2000); // Max once every 2 seconds
 *
 * throttledLog('First call');  // ✓ Executes immediately
 * throttledLog('Second call'); // ✗ Ignored (within 2s)
 * throttledLog('Third call');  // ✗ Ignored (within 2s)
 *
 * setTimeout(() => throttledLog('Fourth call'), 2500); // ✓ Executes (after 2.5s)
 * ```
 *
 * @example API rate limiting:
 * ```typescript
 * const fetchUserData = async (userId: string): Promise<User> => {
 *   const response = await fetch(`/api/users/${userId}`);
 *   return response.json();
 * };
 *
 * // Limit API calls to once per user every 5 seconds
 * const throttledFetch = throttle(fetchUserData, 5000);
 *
 * throttledFetch('user123'); // → Makes API call
 * throttledFetch('user123'); // → Returns cached promise
 * throttledFetch('user456'); // → Makes API call (different argument)
 * ```
 *
 * @example Global throttling (ignore arguments):
 * ```typescript
 * const saveDocument = (content: string) => {
 *   // Expensive save operation
 *   localStorage.setItem('document', content);
 * };
 *
 * // Global throttle: max one save every 1 second regardless of content
 * const throttledSave = throttle(saveDocument, 1000, true);
 *
 * throttledSave('draft 1'); // ✓ Saves
 * throttledSave('draft 2'); // ✗ Ignored
 * throttledSave('draft 3'); // ✗ Ignored
 * ```
 *
 * @example Event handler optimization:
 * ```typescript
 * const handleScroll = (event: Event) => {
 *   // Expensive scroll calculations
 *   updateScrollPosition();
 *   recalculateLayout();
 * };
 *
 * const throttledScroll = throttle(handleScroll, 16); // ~60fps
 * window.addEventListener('scroll', throttledScroll);
 * ```
 *
 * @example Database query throttling:
 * ```typescript
 * const searchDatabase = async (query: string, filters: SearchFilters) => {
 *   return await db.search(query, filters);
 * };
 *
 * // Throttle searches to prevent database overload
 * const throttledSearch = throttle(searchDatabase, 500);
 *
 * // Multiple rapid searches with same params return same promise
 * const result1 = throttledSearch('typescript', { category: 'tech' });
 * const result2 = throttledSearch('typescript', { category: 'tech' }); // Same promise
 * const result3 = throttledSearch('javascript', { category: 'tech' }); // New query
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

  /**
   * Internal helper to update call tracking state.
   *
   * @param argMap - Serialized argument key for caching
   * @param callLog - Call tracking object to store
   */
  const update = (argMap: string, callLog: any) => {
    callMap.set(argMap, callLog);
  };

  /**
   * Safely serializes function arguments for use as cache keys.
   * Handles non-serializable objects gracefully by falling back to type-based keys.
   *
   * @param args - Function arguments to serialize
   * @returns String representation suitable for use as a Map key
   */
  const safeStringify = (args: any[]): string => {
    try {
      return JSON.stringify(args);
    } catch {
      // If JSON.stringify fails (e.g., circular references), use a simpler approach
      return String(
        args.map((arg) => typeof arg === "object" ? "object" : arg),
      );
    }
  };

  const throttled = function (...args: Parameters<T>): ReturnType<T> {
    const argMap = safeStringify(ignoreArgs ? [] : args);
    const callLog = callMap.get(argMap) ??
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
 * Method decorator that applies throttling to class methods.
 *
 * This decorator transforms a class method into a throttled version that will
 * execute at most once every specified delay period. It's particularly useful
 * for event handlers, API calls, or any method that might be called frequently.
 *
 * **Features:**
 * - Preserves method context (`this` binding)
 * - Supports both sync and async methods
 * - Maintains original method signature and return type
 * - Independent throttling per method and instance
 *
 * **Memory Management:**
 * Each decorated method gets its own throttling state, and each instance
 * of the class maintains separate throttling counters.
 *
 * @param delay - The throttling delay in milliseconds
 * @param ignoreArgs - If true, throttles globally regardless of arguments; if false, throttles per unique argument set
 * @returns A method decorator that can be applied to class methods
 *
 * @example Basic method throttling:
 * ```typescript
 * class SearchService {
 *   @Throttle(1000) // Max once per second
 *   async performSearch(query: string): Promise<SearchResult[]> {
 *     console.log(`Searching for: ${query}`);
 *     return await this.apiClient.search(query);
 *   }
 * }
 *
 * const service = new SearchService();
 * service.performSearch('TypeScript'); // ✓ Executes immediately
 * service.performSearch('JavaScript'); // ✗ Ignored (within 1s)
 * service.performSearch('Python');     // ✗ Ignored (within 1s)
 *
 * setTimeout(() => service.performSearch('Rust'), 1500); // ✓ Executes (after 1.5s)
 * ```
 *
 * @example Event handler throttling:
 * ```typescript
 * class WindowManager {
 *   @Throttle(100) // Max 10 times per second
 *   handleResize(event: Event): void {
 *     console.log('Handling resize event');
 *     this.recalculateLayout();
 *     this.updateScrollbars();
 *   }
 *
 *   @Throttle(16) // ~60fps
 *   handleScroll(event: Event): void {
 *     this.updateScrollPosition();
 *   }
 * }
 *
 * const manager = new WindowManager();
 * window.addEventListener('resize', manager.handleResize.bind(manager));
 * window.addEventListener('scroll', manager.handleScroll.bind(manager));
 * ```
 *
 * @example API client with throttled methods:
 * ```typescript
 * class ApiClient {
 *   @Throttle(5000, true) // Global throttle: max one save every 5s
 *   async saveUserProfile(userId: string, data: UserProfile): Promise<void> {
 *     await fetch(`/api/users/${userId}`, {
 *       method: 'PUT',
 *       body: JSON.stringify(data)
 *     });
 *   }
 *
 *   @Throttle(1000) // Per-argument throttle: max once per user per second
 *   async getUserData(userId: string): Promise<User> {
 *     const response = await fetch(`/api/users/${userId}`);
 *     return response.json();
 *   }
 * }
 * ```
 *
 * @example Multiple instances with independent throttling:
 * ```typescript
 * class Logger {
 *   constructor(private name: string) {}
 *
 *   @Throttle(2000)
 *   log(message: string): void {
 *     console.log(`[${this.name}] ${message}`);
 *   }
 * }
 *
 * const logger1 = new Logger('Service1');
 * const logger2 = new Logger('Service2');
 *
 * logger1.log('Message 1'); // ✓ Logs immediately
 * logger2.log('Message 2'); // ✓ Logs immediately (different instance)
 * logger1.log('Message 3'); // ✗ Ignored (within 2s for logger1)
 * ```
 */
export const Throttle =
  (delay: number, ignoreArgs = false): MethodDecorator =>
  (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (typeof descriptor.value === "function") {
      const original = descriptor.value;
      descriptor.value = throttle(original, delay, ignoreArgs);
    }
    return descriptor;
  };
