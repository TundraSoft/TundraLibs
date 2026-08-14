/**
 * @fileoverview `once(fn)` and `@Once` — run a function exactly once,
 * memoize its result (or thrown error) for all later calls.
 *
 * @module
 */

// deno-lint-ignore-file

/**
 * Wrap `fn` so it runs at most once. The first call's result (or thrown
 * error) is cached; later calls return the cached value or re-throw the
 * cached error, ignoring their arguments.
 *
 * @typeParam T - Signature of the wrapped function.
 * @param fn - Function to run once.
 * @returns A wrapper with the same signature as `fn`.
 *
 * @example
 * ```typescript
 * declare function connectToDb(): { host: string };
 *
 * const init = once(() => connectToDb());
 * const a = init(); // runs
 * const b = init(); // returns cached
 * console.log(a === b); // true
 * ```
 */
export const once = <T extends (...args: any[]) => any>(fn: T): T => {
  let result: ReturnType<T>;
  let called = false;
  // Track whether the first call threw separately from the thrown value, so a
  // falsy throw (`throw 0`, `throw ''`, `throw false`) is still re-thrown on
  // later calls instead of being swallowed by a truthiness check.
  let didThrow = false;
  let error: unknown;

  const onceFn = ((...args: Parameters<T>): ReturnType<T> => {
    if (!called) {
      called = true;
      try {
        result = fn(...args);
      } catch (e) {
        didThrow = true;
        error = e;
        throw e;
      }
    } else if (didThrow) {
      throw error;
    }
    return result;
  }) as T;

  return onceFn;
};

/**
 * Method decorator: each instance runs the decorated method at most once.
 *
 * State is stored per-instance in a non-enumerable `__once_state_<key>`
 * property, so two instances run the method independently. Both sync
 * and async methods are supported; a sync throw is cached and re-thrown
 * on later calls, while an async rejection is cached and returned as a
 * rejected Promise (so `.catch()` keeps working on later calls).
 *
 * @example
 * ```typescript
 * declare function connect(): Promise<void>;
 *
 * class Service {
 *   @Once
 *   async init() { await connect(); }
 * }
 * const s = new Service();
 * await s.init(); // runs
 * await s.init(); // no-op
 * ```
 */
export function Once(
  _target: object,
  _propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  if (typeof descriptor.value !== 'function') return descriptor;

  const original = descriptor.value;
  descriptor.value = function (this: any, ...args: unknown[]) { // deno-lint-ignore no-explicit-any
    const stateKey = `__once_state_${String(_propertyKey)}`;
    let state = this[stateKey];
    if (!state) {
      state = {
        called: false,
        result: undefined,
        resolved: undefined,
        didThrow: false,
        error: undefined,
        isAsync: false,
      };
      Object.defineProperty(this, stateKey, {
        value: state,
        configurable: false,
        enumerable: false,
        writable: true,
      });
    }
    if (!state.called) {
      state.called = true;
      try {
        const r = original.apply(this, args);
        // Handle promise case to preserve same promise and error/result semantics
        if (r instanceof Promise) {
          // Remember this is an async method so later calls re-wrap the
          // cached value in a Promise (preserving .then/Promise.all).
          state.isAsync = true;
          // Cache the in-flight promise so concurrent calls share it; the
          // resolved value is cached separately in `resolved` so we never
          // overwrite `result` with a non-Promise value.
          state.result = r.then(
            (val: unknown) => {
              state.resolved = val; // cache resolved value separately
              return val;
            },
            (err: unknown) => {
              state.didThrow = true;
              state.error = err;
              throw err;
            },
          );
          return state.result;
        }
        state.result = r;
        return r;
      } catch (e) {
        state.didThrow = true;
        state.error = e;
        throw e;
      }
    }
    // Use the explicit `didThrow` flag (not `state.error`'s truthiness) so a
    // cached falsy thrown value is still re-thrown on later calls.
    if (state.didThrow) {
      // For async methods a cached rejection must come back as a rejected
      // Promise (symmetric with the resolved path below), not a synchronous
      // throw — otherwise `.catch()` on later calls never runs.
      if (state.isAsync) return Promise.reject(state.error);
      throw state.error;
    }
    // For async methods always hand back a Promise: while the original
    // call is still pending return the shared in-flight promise, and once
    // it has resolved return a freshly-resolved Promise of the value.
    if (state.isAsync) {
      return state.resolved === undefined
        ? state.result
        : Promise.resolve(state.resolved);
    }
    return state.result;
  };
  return descriptor;
}
