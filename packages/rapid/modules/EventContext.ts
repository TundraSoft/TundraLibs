/**
 * @fileoverview `EventContext` — one subscriber's delivery of one event.
 * Carries CORRELATION only (the originating `requestId`, a trace id with
 * zero authority) — deliberately NO state: an event is a fact, not a
 * request, so a subscriber never acts on behalf of a caller.
 *
 * @module
 */

/** Construction data for an {@link EventContext}. */
export type EventContextInit = {
  requestId: string;
  action: string;
  event: string;
};

export class EventContext {
  /** The context discriminator — always `'EVENT'`. */
  public readonly type = 'EVENT' as const;
  /** The originating emission's correlation id — a trace id with no authority. */
  public readonly requestId: string;
  /** Uniform invocation identity — `event <qualified-name>`. */
  public readonly action: string;
  /** The qualified event name (`namespace:Module:EventName`). */
  public readonly event: string;

  /** Carry the emission's correlation id, action label, and qualified event name. */
  constructor(init: EventContextInit) {
    this.requestId = init.requestId;
    this.action = init.action;
    this.event = init.event;
  }
}
