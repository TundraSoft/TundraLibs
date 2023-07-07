// Events.ts
import { Callback, EventName, EventsType, Listeners } from './types.ts';

/**
 * Events
 * Adds the capability of event handling for any class which derives this class.
 * This is not meant to be used as a standalone class.
 * Based out of eventemitter class for nodejs.
 */
// deno-lint-ignore no-explicit-any
export class Events<E extends EventsType = Record<EventName, any>> {
  protected _events: Map<keyof E, Set<Listeners>> = new Map();

  /**
   * on
   * Method override to add event monitor for typed events.
   *
   * @param event Key of Typed event definition
   * @param callback Callback to call
   * @returns self refernce for chaining
   */
  public on<K extends keyof E>(event: K, callback: E[K]): this;

  /**
   * on
   * Initialize or create an event monitor. If the class is initialised as
   * strictly typed, then the event name must be part of the list shared.
   *
   * @param event string The event name to which monitor
   * @param callback function The callback functions
   * @returns self refernce for chaining
   */
  public on(event: EventName, callback: Callback): this {
    if (!this._events.get(event)) {
      this._events.set(event, new Set());
    }
    this._events.get(event)?.add(callback);
    return this;
  }

  /**
   * once
   * Method override to monitor event once for typed events.
   *
   * @param event Key of Typed event definition
   * @param callback Callback to call
   * @returns self refernce for chaining
   */
  public once<K extends keyof E>(event: K, callback: E[K]): this;

  /**
   * once
   * Create an event which only fires once post which the event is
   * discarded.
   *
   * @param event string The event name
   * @param callback function The function to call
   * @returns self Self reference for chaining
   */
  public once(event: EventName, callback: Callback): this {
    const listen: Listeners = callback;
    listen.__once = true;
    // deno-lint-ignore no-explicit-any
    return this.on(event, listen as any);
  }

  /**
   * off
   * Method override to remove a specific callback in event chain
   *
   * @param event Key of Typed event definition
   * @param callback Callback to remove
   */
  public off<K extends keyof E>(event: K, callback: E[K]): this;

  /**
   * off
   * Remove all callbacks for a specific event
   *
   * @param event Key of typed event definition
   */
  public off<K extends keyof E>(event: K): this;

  /**
   * off
   * Override to remove all events
   */
  public off(): this;

  /**
   * off
   * Removes specific or all event callbacks. If a specific callback
   * is specified, then only that is removed, if only event name is passed
   * then all callbacks in the event is removed. If no event name is passed
   * all callbacks in all events are removed.
   *
   * @param event string The event name
   * @param callback function The function to be removed
   * @returns self Self reference for chaining
   */
  public off(event?: EventName, callback?: Callback): this {
    if (!event && !callback) {
      // Clear all events
      this._events.clear();
    } else if (event && this._events.has(event)) {
      // Handle specific event and possibly specific callbacks
      if (callback) {
        // If callback exists, delete it
        const callbacks = this._events.get(event)!;
        if (callbacks.has(callback)) {
          callbacks.delete(callback);
        }
      } else {
        // delete all listeners
        this._events.delete(event);
      }
    }
    return this;
  }

  /**
   * emit
   * Method override for typed events
   * Calls all callback to the specific event provided waiting for each event to return
   *
   * @param event Key of typed event definition
   * @param args Array<Parameters> Typed Arguments to pass to the callback
   */
  protected async emit<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): Promise<ReturnType<E[K]>[]>;

  /**
   * emit
   * Calls all callback to the specific event provided waiting for each event to return
   *
   * @param event string The event name
   * @param args Array<any> Arguments to pass to the callback
   * @returns Promise<ReturnType<Callback>[]> Array of return values from each callback
   */
  protected async emit(
    event: EventName,
    ...args: Parameters<Callback>
  ): Promise<ReturnType<Callback>[]> {
    const returnValue: ReturnType<Callback>[] = [];
    if (this._events.has(event)) {
      const e = this._events.get(event)!;
      for (const [, callback] of e.entries()) {
        try {
          returnValue.push(await callback.apply(callback, args));
          if (callback.__once) {
            delete callback.__once;
            e.delete(callback);
          }
        } catch (_error) {
          // @TODO - Figure out what to do here
        }
      }
      // Delete event from set - This will happen if all callbacks are once.
      if (e.size === 0) {
        this._events.delete(event);
      }
    }
    return returnValue;
  }

  /**
   * emitSync
   * Method override to emit events synchronously
   * Calls all callback to the specific event provided without waiting for each event to return
   *
   * @param event Key of typed event definition
   * @param args Array<Parameters> Typed Arguments to pass to the callback
   */
  protected emitSync<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): ReturnType<E[K]>[];

  /**
   * emitSync
   * Calls all callback to the specific event provided without waiting for each event to return
   *
   * @param event string The event name
   * @param args Array<any> Arguments to pass to the callback
   * @returns ReturnType<Callback>[] Array of return values from each callback
   */
  protected emitSync(
    event: EventName,
    ...args: Parameters<Callback>
  ): ReturnType<Callback>[] {
    const returnValue: ReturnType<Callback>[] = [];
    if (this._events.has(event)) {
      const e = this._events.get(event)!;
      for (const [, callback] of e.entries()) {
        try {
          const r: ReturnType<Callback> = callback(...args); //callback.apply(callback, args);
          if (r instanceof Promise) {
            r.then((val) => returnValue.push(val)).catch(() => {});
          }
          if (callback.__once) {
            delete callback.__once;
            e.delete(callback);
          }
        } catch (_error) {
          // @TODO - Figure out what to do here
        }
      }
      // Delete event from set - This will happen if all callbacks are once.
      if (e.size === 0) {
        this._events.delete(event);
      }
    }
    return returnValue;
  }
}
