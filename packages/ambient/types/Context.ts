/**
 * @fileoverview The {@link Context} primitive surface — a typed, async-safe
 * store whose value survives `await` and stays isolated between concurrent
 * async flows.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * A typed handle over an async-context store (an `AsyncLocalStorage` under the
 * hood). The value established by {@link Context.run} is visible to any
 * synchronous or asynchronous code executed within that call — at any depth,
 * across every `await` — and is isolated from other concurrent
 * {@link Context.run} flows.
 *
 * Obtain one with `createContext<T>()`.
 *
 * @typeParam T - The shape of the value carried in the store.
 */
export type Context<T> = {
  /**
   * Run `fn` with `value` established as the active context, returning `fn`'s
   * result. Any {@link Context.get} call reachable from `fn` (however deep,
   * across any `await`) observes `value`; code outside this call does not.
   *
   * @typeParam R - `fn`'s return type (a sync value or a promise).
   * @param value - The value to make active for the duration of `fn`.
   * @param fn - The function to run within the context.
   * @returns Whatever `fn` returns.
   */
  run<R>(value: T, fn: () => R): R;

  /**
   * The active value, or `undefined` when called outside any
   * {@link Context.run} scope. Never throws.
   */
  get(): T | undefined;

  /**
   * The active value, or `fallback` when called outside any
   * {@link Context.run} scope. Never throws.
   *
   * @param fallback - Returned when no context is active.
   */
  getOr(fallback: T): T;

  /** `true` when a {@link Context.run} scope is active, `false` otherwise. */
  active(): boolean;
};
