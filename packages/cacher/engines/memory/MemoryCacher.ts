import { unrefTimer } from '@tundralibs/compat/runtime';
import { type PrivateObject, privateObject } from '@tundralibs/utils';
import { AbstractEngine } from '../../AbstractEngine.ts';
import type { CacheValue } from '../../types/mod.ts';
import type { MemoryCacherOptions } from './types/mod.ts';

/**
 * In-memory cacher implementation.
 *
 * Provides caching functionality using the process memory. This implementation:
 * - Stores data in-memory (non-persistent)
 * - Supports expiry times via setTimeout
 * - Implements window mode to extend expiry on access
 *
 * Note: This cacher is local to the current process and doesn't support sharing
 * across multiple processes or servers.
 *
 * @extends AbstractCacher<MemoryCacherOptions>
 * @see {@link AbstractEngine} for details on the base implementation
 * @see {@link MemoryCacherOptions} for configuration options
 * @example
 * ```ts
 * // Create a memory cacher
 * const cache = new MemoryCacher('user-cache', {});
 *
 * // Set a value with 5 minute expiry
 * await cache.set('user:1', { name: 'John', role: 'admin' }, { expiry: 300 });
 *
 * // Get a value
 * const user = await cache.get('user:1');
 *
 * // Clear the cache when done
 * await cache.clear();
 * ```
 */
export class MemoryCacher extends AbstractEngine<MemoryCacherOptions> {
  /**
   * The engine identifier for in-memory cacher.
   */
  public readonly Engine = 'MEMORY';

  /**
   * Internal storage for cached values.
   * @protected
   */
  protected _cache: PrivateObject<{ [key: string]: CacheValue }> =
    privateObject<{ [key: string]: CacheValue }>();

  /**
   * Map of expiry timers for cached values.
   * @protected
   */
  protected _expiryTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  /**
   * Map of absolute expiry deadlines (epoch milliseconds) for cached values.
   * Used for a lazy deadline check on read so a value is treated as expired even
   * if its `setTimeout` has not fired yet (e.g. timers throttled in the
   * background).
   * @protected
   */
  protected _deadlines: Map<string, number> = new Map();

  /**
   * Largest delay (ms) `setTimeout` can represent. Anything beyond this overflows
   * the 32-bit signed delay and would fire (almost) immediately, so the delay is
   * clamped to this value while the absolute deadline still guards correctness.
   * @protected
   */
  protected static readonly _MAX_TIMER_DELAY = 2_147_483_647;

  /**
   * Creates a new in-memory cacher instance.
   *
   * @param name - A unique name for this cacher instance
   * @param options - Configuration options for this cacher
   */
  constructor(name: string, options: MemoryCacherOptions) {
    super(name, options);
  }

  /**
   * Finalizes the in-memory cacher by clearing all cached values.
   *
   * @returns A promise that resolves when the operation is complete
   * @override
   */
  public override finalize(): void {
    this._clear();
  }

  //#region Abstract methods
  /**
   * Stores a value in memory.
   * Sets up an expiry timer if an expiry time is specified.
   *
   * @param key - The normalized key
   * @param value - The value to store
   * @protected
   * @override
   */
  protected _set(key: string, value: CacheValue): void {
    // Clear any pre-existing timer/deadline for this key first; otherwise an
    // orphaned timer from a previous set would evict the freshly-set value early.
    clearTimeout(this._expiryTimers.get(key));
    this._expiryTimers.delete(key);
    this._deadlines.delete(key);
    this._cache.set(key, value);
    if (value.expiry && value.expiry > 0) {
      this._scheduleExpiry(key, value.expiry);
    }
  }

  /**
   * Retrieves a value from memory.
   * Resets the expiry timer if window mode is enabled.
   *
   * @param key - The normalized key
   * @returns The cached value, or undefined if not found
   * @protected
   * @override
   */
  protected _get(key: string): CacheValue | undefined {
    const val = this._cache.get(key);
    if (val === undefined) {
      return undefined;
    }
    // Lazy deadline check: a value past its absolute deadline is expired even if
    // its timer has not fired yet (timers can be throttled or delayed).
    const deadline = this._deadlines.get(key);
    if (deadline !== undefined && Date.now() >= deadline) {
      this._delete(key);
      return undefined;
    }
    if (val.window === true && val.expiry > 0) {
      this._scheduleExpiry(key, val.expiry);
    }
    return val;
  }

  /**
   * Checks if a key exists in memory.
   *
   * @param key - The normalized key
   * @returns True if the key exists, false otherwise
   * @protected
   * @override
   */
  protected _has(key: string): boolean {
    // Lazy deadline check, mirroring _get: a key past its absolute deadline is
    // expired even if its eviction timer has not fired yet (timers can be
    // throttled/delayed), so has() must not report it as still present.
    const deadline = this._deadlines.get(key);
    if (deadline !== undefined && Date.now() >= deadline) {
      this._delete(key);
      return false;
    }
    return this._cache.has(key);
  }

  /**
   * Deletes a value from memory and clears its expiry timer.
   *
   * @param key - The normalized key
   * @protected
   * @override
   */
  protected _delete(key: string): void {
    // Implementation for deleting a key from memory
    clearTimeout(this._expiryTimers.get(key));
    this._expiryTimers.delete(key);
    this._deadlines.delete(key);
    this._cache.delete(key);
  }

  /**
   * Clears all values from memory and cancels all expiry timers.
   *
   * @protected
   * @override
   */
  protected _clear(): void {
    // Implementation for clearing all keys in memory
    this._expiryTimers.forEach((timer) => clearTimeout(timer));
    this._expiryTimers.clear();
    this._deadlines.clear();
    this._cache.clear();
  }
  //#endregion Abstract methods

  //#region Protected methods
  /**
   * Schedules (or reschedules) expiry for `key`, `expirySeconds` seconds from now.
   *
   * Records an absolute deadline (for the lazy check in {@link MemoryCacher._get})
   * and arms a `setTimeout` to evict the key. The timer delay is clamped to
   * {@link MemoryCacher._MAX_TIMER_DELAY} so an oversized expiry cannot overflow
   * the 32-bit delay and fire immediately; the absolute deadline keeps eviction
   * correct in that case.
   *
   * @param key - The normalized key
   * @param expirySeconds - Expiry in seconds (must be greater than 0)
   * @protected
   */
  protected _scheduleExpiry(key: string, expirySeconds: number): void {
    const delayMs = expirySeconds * 1000;
    this._deadlines.set(key, Date.now() + delayMs);
    clearTimeout(this._expiryTimers.get(key));
    const timer = setTimeout(() => {
      this._delete(key);
    }, Math.min(delayMs, MemoryCacher._MAX_TIMER_DELAY));
    // Don't let a pending expiry timer pin the process alive. A CLI / cron /
    // serverless job that sets a key and finishes its work must be able to
    // exit without waiting out the TTL (default 300s, up to ~24.8 days). The
    // lazy absolute-deadline checks in _get/_has keep eviction correct even
    // when the timer never fires. compat's unrefTimer smooths over the
    // per-runtime unref primitive (`.unref()` vs `Deno.unrefTimer`) and
    // no-ops where none exists.
    unrefTimer(timer);
    this._expiryTimers.set(key, timer);
  }
  //#endregion Protected methods
}
