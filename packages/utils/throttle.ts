/**
 * @fileoverview `throttle(fn, delay)` and `@Throttle` — limit how often
 * a function executes by reusing the cached result inside a window.
 *
 * Uses `performance.now()` when present, otherwise `Date.now()`. Async
 * functions are tracked through `.finally()` so concurrent calls return
 * the in-flight promise.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any
//#region Compatibility Layer
// Determine the appropriate time function based on the environment
let getCurrentTime: () => number;
if (typeof performance !== 'undefined' && performance.now) {
  // Use high-resolution timer when available (sub-millisecond precision)
  getCurrentTime = () => performance.now();
} else {
  // Fallback to Date.now() for environments without performance API
  getCurrentTime = () => Date.now();
}
//#endregion Compatibility Layer

// Sentinel marking "no result cached yet" for a given argument key. It is
// distinct from every value the wrapped function can return (including `null`
// and `undefined`), so a legitimately `null`-returning function is still
// throttled instead of re-invoked on every call.
const NOT_CALLED: unique symbol = Symbol('throttle.notCalled');

/**
 * Throttle `fn`: each call within `delay` ms of the last execution
 * returns the cached result instead of running again. Async returns
 * are kept in-flight so concurrent callers see the same promise.
 *
 * @typeParam T - Signature of the throttled function.
 * @param fn - Function to throttle.
 * @param delay - Minimum gap between real executions, in ms.
 * @param ignoreArgs - When `true`, throttle globally; when `false`
 *   (default), throttle per unique argument set (keyed by JSON).
 * @returns A wrapper with the same signature as `fn`.
 *
 * @example
 * ```typescript
 * declare function handleScroll(): void;
 *
 * const onScroll = throttle(handleScroll, 16); // ~60fps
 * window.addEventListener('scroll', onScroll);
 * ```
 */
export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  ignoreArgs = false,
): T => {
  const callMap: Map<
    string,
    {
      lastCall: number;
      returnValue: ReturnType<T> | typeof NOT_CALLED;
      isRunning: boolean;
    }
  > = new Map();

  const update = (argMap: string, callLog: any) => {
    callMap.set(argMap, callLog);
  };

  // JSON.stringify can fail on circular refs — fall back to a coarse type-based key.
  const safeStringify = (args: any[]): string => {
    try {
      return JSON.stringify(args);
    } catch {
      // If JSON.stringify fails (e.g., circular references), use a simpler approach
      return String(
        args.map((arg) => typeof arg === 'object' ? 'object' : arg),
      );
    }
  };

  const throttled = function (
    this: unknown,
    ...args: Parameters<T>
  ): ReturnType<T> {
    const argMap = safeStringify(ignoreArgs ? [] : args);
    const callLog = callMap.get(argMap) ??
      { lastCall: 0, returnValue: NOT_CALLED, isRunning: false };
    const currentTime = getCurrentTime();
    // Lets re-write without setTimeout
    // If currently running or still within throttle window, return cached result when present.
    if (
      callLog.isRunning === true ||
      (callLog.lastCall > 0 && currentTime - callLog.lastCall < delay)
    ) {
      const cached = callLog.returnValue;
      // Compare against the sentinel (not `null`) so a cached `null` return
      // value is served from cache instead of falling through to re-invoke.
      if (cached !== NOT_CALLED) return cached as ReturnType<T>;
    } else if (
      callLog.lastCall > 0 && currentTime - callLog.lastCall >= delay
    ) {
      // Re-run it
      callLog.lastCall = 0;
      callLog.returnValue = NOT_CALLED;
    }
    callLog.lastCall = currentTime;
    // Forward `this` so the decorator form (@Throttle) works on instance
    // methods: called as `instance.method()`, `this` is the instance here and
    // must reach the original method, otherwise (strict-mode modules) it runs
    // with `this === undefined` and crashes on any instance-state access.
    const result = fn.apply(this, args) as ReturnType<T>;
    callLog.returnValue = result;
    if ((result as any) instanceof Promise) {
      callLog.isRunning = true;
      (result as Promise<unknown>)
        .finally(() => {
          callLog.isRunning = false;
          // Update time so that delay is in effect from here
          callLog.lastCall = getCurrentTime();
          // Update...
          update(argMap, callLog);
        })
        // `.finally()` returns a NEW promise that adopts the original's
        // rejection. The caller receives the ORIGINAL promise (returned below)
        // and handles its rejection; swallow the rejection of this derived
        // cleanup promise so it does not surface as an unhandled rejection
        // (which terminates the process under the Node >=15 / Deno default
        // policy) even when the caller correctly catches its own promise.
        .catch(() => {});
    }
    update(argMap, callLog);
    return result;
  };

  return throttled as T;
};

/**
 * Method decorator form of {@link throttle}, usable on both methods and
 * getters. Both are throttled PER-INSTANCE (mirroring `@Memoize`): each object
 * gets its own throttle window and result cache, so a decorated method can
 * safely read and mutate instance state — one instance never receives another
 * instance's cached return value, and its own body is never skipped in favour
 * of another instance's result. The per-instance throttle state lives in a
 * non-enumerable `__throttled` map so it never leaks into JSON/serialization.
 * Use `throttle()` directly if you instead need a single window shared across
 * all instances.
 *
 * @param delay - Minimum gap between executions, in ms.
 * @param ignoreArgs - When `true`, throttle globally; when `false`
 *   (default), throttle per unique argument set.
 *
 * @example
 * ```typescript
 * declare const api: { search(q: string): Promise<string[]> };
 *
 * class Search {
 *   @Throttle(1000)
 *   async run(q: string) { return api.search(q); }
 * }
 * ```
 */
export const Throttle =
  (delay: number, ignoreArgs = false): MethodDecorator =>
  (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (typeof descriptor.value === 'function') {
      // Methods depend on `this`, so throttle PER-INSTANCE (mirroring the getter
      // branch and `@Memoize`). A single `throttle()` closure on the prototype
      // would share ONE result cache — keyed only by arguments — across every
      // instance, so a second instance calling within the window would be served
      // the first instance's cached return value and its own body (and any state
      // mutation) would be skipped. Build (and cache) a throttled wrapper bound
      // to the instance on first call, keyed in a non-enumerable per-instance
      // map so it never leaks into JSON/serialization.
      const original = descriptor.value;
      descriptor.value = function (this: any, ...args: any[]) {
        // Prefix the key with the member KIND ('method_') so it can never
        // collide with the getter branch's ('getter_') key inside the shared
        // per-instance `__throttled` map. Without a kind prefix, a method
        // literally named `get_foo` (key `X_get_foo`) and a getter named `foo`
        // (key `X_get_foo`) hash identically and silently swap throttle
        // state/results. The two prefixes differ at char 0, so method and
        // getter key-spaces are disjoint for every possible member name.
        const instanceKey = this && this.constructor
          ? `method_${this.constructor.name}_${String(propertyKey)}`
          : `method_${String(propertyKey)}`;
        if (!this.__throttled) {
          Object.defineProperty(this, '__throttled', {
            value: new Map(),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
        if (!this.__throttled.has(instanceKey)) {
          this.__throttled.set(
            instanceKey,
            throttle(
              (...a: any[]) => original.apply(this, a),
              delay,
              ignoreArgs,
            ),
          );
        }
        return this.__throttled.get(instanceKey)(...args);
      };
    } else if (typeof descriptor.get === 'function') {
      // Getters depend on `this`, so throttle per-instance: build (and cache)
      // a throttled wrapper bound to the instance on first access, keyed in a
      // non-enumerable per-instance map.
      const originalGetter = descriptor.get;
      descriptor.get = function (this: any) {
        // Prefix with the member KIND ('getter_') — disjoint from the method
        // branch's ('method_') prefix — so the two never share a cache slot in
        // the per-instance `__throttled` map (see the method branch above).
        const instanceKey = this && this.constructor
          ? `getter_${this.constructor.name}_${String(propertyKey)}`
          : `getter_${String(propertyKey)}`;
        if (!this.__throttled) {
          Object.defineProperty(this, '__throttled', {
            value: new Map(),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
        if (!this.__throttled.has(instanceKey)) {
          this.__throttled.set(
            instanceKey,
            throttle(() => originalGetter.apply(this), delay, ignoreArgs),
          );
        }
        return this.__throttled.get(instanceKey)();
      };
    }
    return descriptor;
  };
