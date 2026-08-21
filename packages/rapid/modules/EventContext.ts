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
  public readonly type = 'EVENT' as const;
  public readonly requestId: string;
  public readonly action: string;
  /** The qualified event name (`namespace:Module:EventName`). */
  public readonly event: string;

  constructor(init: EventContextInit) {
    this.requestId = init.requestId;
    this.action = init.action;
    this.event = init.event;
  }
}
