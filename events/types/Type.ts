import { EventCallback } from './Callback.ts';

/**
 * Basic Event Type definition. An event can either be
 * a string or a number which has a callback function.
 *
 * @example
 * ```ts
 * const events: EventsType = {
 * test1: () => {},
 * 1: () => {}
 * }
 * ```
 */
export type EventType = { [key: string]: EventCallback };

// Path: events/types/EventType.ts
