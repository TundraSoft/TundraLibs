/**
 * Event Callback definition. It can accept any number of arguments and
 * return any value.
 */
// deno-lint-ignore no-explicit-any
export type EventCallback = (...args: any[]) => unknown | Promise<unknown>; // NOSONAR

export type EventListeners = EventCallback & { __once?: true };

// Path: events/types/EventCallback.ts