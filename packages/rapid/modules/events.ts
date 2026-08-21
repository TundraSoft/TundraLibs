/**
 * @fileoverview The event bus — `@tundralibs/utils` `Events` as the
 * ENGINE (listener storage, snapshot-per-emission, per-listener
 * isolation) under a thin publish/subscribe facade — plus the name
 * grammar every event must satisfy and the `event()` marker modules
 * declare events with.
 *
 * @module
 */

import type { Slogger } from '@tundralibs/slogger';
import { Events } from '@tundralibs/utils';
import type { RapidModulePayload } from '../types/mod.ts';

/** `namespace` segment: `posts`, `user-admin`. */
export const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
/** `Module` and `EventName` segments: `Posts`, `PostCreated`. */
export const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
/** A fully-qualified event: `namespace:Module:EventName`. */
export const EVENT_NAME_PATTERN =
  /^[a-z][a-z0-9-]*:[A-Z][A-Za-z0-9]*:[A-Z][A-Za-z0-9]*$/;

const PAYLOAD: RapidModulePayload<unknown> = Object.freeze({});

/**
 * Declare an event and its payload type on a module:
 * `const EVENTS = { PostCreated: event<{ id: string }>() }`. Pure type
 * carrier — one shared frozen object at runtime.
 */
export function event<T>(): RapidModulePayload<T> {
  return PAYLOAD as RapidModulePayload<T>;
}

/**
 * What the runtime registers per subscriber: the payload, the
 * correlation id resolved ONCE for the whole emission, and a tracker to
 * push its settlement promise into. @internal
 */
export type EventSubscriber = (
  payload: unknown,
  requestId: string,
  tracker: Promise<unknown>[],
) => void;

const RESOLVED: Promise<void> = Promise.resolve();
const NOOP = (): void => {};

/**
 * The module event bus. @internal — the runtime is its only client;
 * modules publish through `this.emit`, which validates the declaration.
 */
export class RapidEvents extends Events<Record<string, EventSubscriber>> {
  /** The shared already-resolved promise a no-op emission returns. */
  public static readonly RESOLVED: Promise<void> = RESOLVED;
  /** Subscriber count per event — lets a no-subscriber publish skip every allocation. */
  private readonly __counts = new Map<string, number>();

  constructor(private readonly __log: Slogger) {
    super();
  }

  public subscribe(event: string, subscriber: EventSubscriber): void {
    this.on(event, subscriber);
    this.__counts.set(event, (this.__counts.get(event) ?? 0) + 1);
  }

  public unsubscribe(event: string, subscriber: EventSubscriber): void {
    this.off(event, subscriber);
    this.__counts.set(event, Math.max(0, (this.__counts.get(event) ?? 1) - 1));
  }

  /**
   * Fan out to a snapshot of the subscribers; resolves when all have
   * settled. Never rejects (failures are disclosed per delivery). With no
   * subscribers returns {@link RapidEvents.RESOLVED} and allocates nothing.
   */
  public publish(
    event: string,
    payload: unknown,
    requestId: string,
  ): Promise<void> {
    if ((this.__counts.get(event) ?? 0) === 0) return RESOLVED;
    const tracker: Promise<unknown>[] = [];
    this._emitRaw(event, payload, requestId, tracker);
    return tracker.length === 0
      ? RESOLVED
      : Promise.allSettled(tracker).then(NOOP);
  }

  protected override _onListenerError(
    event: PropertyKey,
    error: unknown,
  ): void {
    this.__log.error('event subscriber failed outside the invocation cycle', {
      event: String(event),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
