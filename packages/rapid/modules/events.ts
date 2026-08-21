/**
 * @fileoverview The event bus — `@tundralibs/utils` `Events` as the
 * ENGINE (listener storage, snapshot-per-emission, per-listener
 * isolation, `once`/`off`) under a thin publish/subscribe facade, plus
 * the name grammar every event must satisfy and the `payload()` marker
 * modules declare events with.
 *
 * @module
 */

import type { Slogger } from '@tundralibs/slogger';
import { Events } from '@tundralibs/utils';
import type { RapidModulePayload } from './types/mod.ts';

/** `namespace` segment: `posts`, `user-admin`. */
export const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
/** `Module` and `EventName` segments: `Posts`, `PostCreated`. */
export const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
/** A fully-qualified event: `namespace:Module:EventName`. */
export const EVENT_NAME_PATTERN =
  /^[a-z][a-z0-9-]*:[A-Z][A-Za-z0-9]*:[A-Z][A-Za-z0-9]*$/;

const PAYLOAD: RapidModulePayload<unknown> = Object.freeze({});

/**
 * Declare an event's payload type on a module:
 * `readonly events = { PostCreated: payload<{ id: string }>() }`. Pure
 * type carrier — one shared frozen object at runtime, no allocation.
 */
export function payload<T>(): RapidModulePayload<T> {
  return PAYLOAD as RapidModulePayload<T>;
}

/**
 * What the runtime registers per subscriber: receives the payload and a
 * per-emission tracker to push its settlement promise into, so
 * `publish()` can resolve when every subscriber has settled.
 */
export type EventSubscriber = (
  payload: unknown,
  tracker: Promise<unknown>[],
) => void;

const RESOLVED: Promise<void> = Promise.resolve();
const NOOP = (): void => {};

/**
 * The module event bus. Subscribers are the runtime's delivery wrappers
 * (each delivery runs through the invocation cycle, so a throwing
 * subscriber is disclosed + isolated there); the engine's own isolation
 * is a backstop routed to the logger.
 */
export class RapidEvents extends Events<Record<string, EventSubscriber>> {
  /** The shared already-resolved promise `publish` returns for a no-op emission. */
  public static readonly RESOLVED: Promise<void> = RESOLVED;

  constructor(private readonly __log: Slogger) {
    super();
  }

  public subscribe(event: string, subscriber: EventSubscriber): void {
    this.on(event, subscriber);
  }

  /**
   * Fan out to a snapshot of the subscribers; resolves when all have
   * settled. Never rejects (subscriber failures are handled per delivery).
   * Zero subscribers → the shared {@link RapidEvents.RESOLVED}, no allocation.
   */
  public publish(event: string, payload: unknown): Promise<void> {
    const tracker: Promise<unknown>[] = [];
    this._emitRaw(event, payload, tracker);
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
