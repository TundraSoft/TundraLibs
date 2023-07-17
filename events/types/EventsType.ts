import { Callback } from './Callback.ts';

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
export type EventsType = { [key: string]: Callback };
//  & {
//   [key: number]: Callback;
// };
