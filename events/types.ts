/**
 * Callback
 * Callback type definition
 */
// deno-lint-ignore no-explicit-any
export type Callback = (...args: any[]) => any | Promise<any>;

/**
 * Listeners
 *
 * Listeners type definition
 */
export type Listeners = Callback & { __once?: true };

export type EventName = string | number;

/**
 * Events
 * Events type definition.
 */
// export type EventsType = { [ key: EventName ]: Callback };
export type EventsType =
  & { [key: string]: Callback }
  & { [key: number]: Callback };
