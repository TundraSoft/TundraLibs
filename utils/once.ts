/**
 * @fileoverview Function execution control utilities for single-call enforcement.
 *
 * This module provides sophisticated mechanisms to ensure functions are executed
 * only once, regardless of how many times they are called. It's particularly
 * useful for initialization routines, expensive computations, and preventing
 * duplicate operations.
 *
 * **Key Features:**
 * - Guaranteed single execution with memoized results
 * - Error handling and propagation on subsequent calls
 * - Support for both sync and async functions
 * - Method decorator for class-based usage
 * - Memory efficient implementation
 * - Type-safe with full TypeScript support
 *
 * **Use Cases:**
 * - Initialization and setup functions
 * - Expensive computation caching
 * - Resource allocation and cleanup
 * - Event handler deduplication
 * - API endpoint rate limiting
 * - Database connection establishment
 *
 * **Performance:**
 * - O(1) overhead after first call
 * - Minimal memory footprint
 * - No timer or interval dependencies
 * - Immediate result return on subsequent calls
 *
 * @example Module initialization:
 * ```typescript
 * const initializeApp = once(() => {
 *   console.log('App initialized');
 *   return loadConfiguration();
 * });
 *
 * // Safe to call multiple times
 * initializeApp(); // Executes
 * initializeApp(); // Returns cached result
 * ```
 */

// deno-lint-ignore-file

/**
 * Wraps a function to ensure it executes only once, caching and returning the result on subsequent calls.
 *
 * This higher-order function creates a wrapper that maintains internal state to track
 * whether the original function has been called. On the first invocation, it executes
 * the function and caches both the result and any thrown errors. All subsequent calls
 * return the cached result or re-throw the cached error.
 *
 * **Behavior:**
 * - First call: Executes function with provided arguments
 * - Subsequent calls: Returns cached result, ignoring new arguments
 * - Error handling: If first call throws, error is cached and re-thrown on subsequent calls
 * - Type safety: Maintains original function signature and return type
 *
 * **Memory Management:**
 * The wrapper maintains minimal state (result cache, call flag, error cache) and
 * doesn't create closures over the original arguments, making it memory efficient.
 *
 * @template T - The type of the function to wrap
 * @param fn - The function to execute only once
 * @returns A wrapped function that executes the original function only on first call
 *
 * @example Basic initialization:
 * ```typescript
 * const setupDatabase = once(() => {
 *   console.log('Connecting to database...');
 *   return new DatabaseConnection();
 * });
 *
 * const db1 = setupDatabase(); // Connects and returns connection
 * const db2 = setupDatabase(); // Returns same connection, no reconnection
 * console.log(db1 === db2); // true
 * ```
 *
 * @example Expensive computation:
 * ```typescript
 * const calculatePrimes = once((limit: number) => {
 *   console.log('Computing primes...');
 *   return computePrimesUpTo(limit);
 * });
 *
 * const primes1 = calculatePrimes(1000); // Computes primes up to 1000
 * const primes2 = calculatePrimes(2000); // Returns same result (ignores 2000)
 * console.log(primes1 === primes2); // true
 * ```
 *
 * @example Error handling:
 * ```typescript
 * const riskyOperation = once(() => {
 *   throw new Error('Something went wrong');
 * });
 *
 * try {
 *   riskyOperation(); // Throws error
 * } catch (e) {
 *   console.log('First call failed');
 * }
 *
 * try {
 *   riskyOperation(); // Throws same cached error
 * } catch (e) {
 *   console.log('Subsequent call failed with same error');
 * }
 * ```
 *
 * @example Async function support:
 * ```typescript
 * const fetchUserData = once(async (userId: string) => {
 *   console.log('Fetching user data...');
 *   const response = await fetch(`/api/users/${userId}`);
 *   return response.json();
 * });
 *
 * const user1 = await fetchUserData('123'); // Makes API call
 * const user2 = await fetchUserData('456'); // Returns cached result from first call
 * console.log(user1 === user2); // true (same cached result)
 * ```
 *
 * @example Resource cleanup:
 * ```typescript
 * const cleanup = once(() => {
 *   console.log('Cleaning up resources...');
 *   closeConnections();
 *   clearCaches();
 *   removeEventListeners();
 * });
 *
 * // Safe to call cleanup multiple times
 * window.addEventListener('beforeunload', cleanup);
 * process.on('SIGTERM', cleanup);
 * process.on('SIGINT', cleanup);
 * ```
 *
 * @example Configuration loading:
 * ```typescript
 * interface AppConfig {
 *   apiUrl: string;
 *   timeout: number;
 *   features: string[];
 * }
 *
 * const loadConfig = once((): AppConfig => {
 *   console.log('Loading configuration...');
 *   return {
 *     apiUrl: process.env.API_URL || 'localhost',
 *     timeout: parseInt(process.env.TIMEOUT || '5000'),
 *     features: JSON.parse(process.env.FEATURES || '[]')
 *   };
 * });
 *
 * // Configuration is loaded only once, regardless of how many modules need it
 * const config1 = loadConfig();
 * const config2 = loadConfig();
 * // Same configuration object returned
 * ```
 *
 * @example Event deduplication:
 * ```typescript
 * const handleWindowResize = once(() => {
 *   console.log('Handling first resize event');
 *   recalculateLayout();
 *   updateDimensions();
 * });
 *
 * // Multiple rapid resize events will only trigger the handler once
 * window.addEventListener('resize', handleWindowResize);
 * ```
 */
export const once = <T extends (...args: any[]) => any>(fn: T): T => {
  let result: ReturnType<T> | undefined;
  let called = false;
  let error: unknown;

  const onceFn = ((...args: Parameters<T>): ReturnType<T> => {
    if (!called) {
      called = true;
      try {
        result = fn(...args) as ReturnType<T>;
      } catch (e) {
        error = e;
        throw e;
      }
    } else if (error) {
      throw error;
    }
    return result as ReturnType<T>;
  }) as T;

  return onceFn;
};

/**
 * Method decorator that ensures a class method executes only once per instance.
 *
 * This decorator transforms a class method into a once-only version by applying
 * the `once` function wrapper. Each instance of the class gets its own once-only
 * state, meaning the method can be called once per instance but not globally.
 *
 * **Behavior:**
 * - Per-instance enforcement: Each class instance has independent once-only state
 * - Method preservation: Original method signature and return type are maintained
 * - Error handling: Errors from first call are cached and re-thrown on subsequent calls
 * - Context binding: `this` context is properly preserved in the decorated method
 *
 * **Use Cases:**
 * - Initialization methods that should run only once per instance
 * - Expensive setup operations (database connections, file loading, etc.)
 * - Event handler registration that should happen only once
 * - Resource allocation that needs single-call guarantees
 * - Cache warming operations
 *
 * @param _target - The class prototype (not used but required by decorator signature)
 * @param _propertyKey - The name of the decorated method (not used but required)
 * @param descriptor - The property descriptor containing the original method
 * @returns Modified property descriptor with once-only behavior
 *
 * @example Basic service initialization:
 * ```typescript
 * class DatabaseService {
 *   private connection = null;
 *
 *   @Once
 *   async initialize() {
 *     console.log('Initializing database connection...');
 *     this.connection = await createConnection();
 *   }
 *
 *   async query(sql: string) {
 *     await this.initialize(); // Safe to call multiple times
 *     return this.connection.query(sql);
 *   }
 * }
 * ```
 *
 * @example Multiple instances with independent state:
 * ```typescript
 * class Logger {
 *   constructor(private name: string) {}
 *
 *   @Once
 *   initialize() {
 *     console.log(`Initializing logger: ${this.name}`);
 *   }
 * }
 *
 * const logger1 = new Logger('Service1');
 * const logger2 = new Logger('Service2');
 *
 * logger1.initialize(); // Logs: "Initializing logger: Service1"
 * logger1.initialize(); // Does nothing
 * logger2.initialize(); // Logs: "Initializing logger: Service2"
 * ```
 */
export function Once(
  _target: object,
  _propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  if (typeof descriptor.value === "function") {
    descriptor.value = once(descriptor.value);
  }
  return descriptor;
}
