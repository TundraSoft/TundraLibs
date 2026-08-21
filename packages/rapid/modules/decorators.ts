/**
 * @fileoverview `@On` (subscribe a method to events) and `@Use` (attach
 * invoke-time middleware to a method). Metadata-only, like every rAPId
 * decorator — they record into side tables and NEVER wrap the method, so
 * a decorated method called directly is just a method (that is the
 * testability guarantee; middleware applies only through `invoke`).
 *
 * @module
 */

import { assertMethodContext } from '../decorators/registry.ts';
import { RapidError } from '../errors/mod.ts';
import { EVENT_NAME_PATTERN } from './events.ts';
import type {
  RapidModuleInvokeMiddleware,
  RapidModuleMethodDecorator,
} from './types/mod.ts';

const ON = new WeakMap<object, string[]>();
const USE = new WeakMap<object, RapidModuleInvokeMiddleware[]>();

/**
 * Subscribe the method to one or more events (fully qualified
 * `namespace:Module:EventName`). The handler receives
 * `(payload, ctx: EventContext)`. Names are validated HERE, at
 * decoration time; whether a mounted module actually declares them is
 * validated at runtime finalization (boot), so a typo or a removed event
 * fails the boot, never a silent never-fires.
 *
 * @throws {RapidError} RAPID_CONFIG on a malformed event name, no names,
 *   or an illegal placement (legacy decorator mode, static/private).
 */
export function On(...events: string[]): RapidModuleMethodDecorator {
  if (events.length === 0) {
    throw new RapidError('RAPID_CONFIG', {
      message: '@On needs at least one event name',
    });
  }
  for (const event of events) {
    if (!EVENT_NAME_PATTERN.test(event)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `@On '${event}' is not a valid event name — expected ` +
          `namespace:Module:EventName (e.g. posts:Posts:PostCreated)`,
        details: { event },
      });
    }
  }
  return (target, context) => {
    assertMethodContext(context, 'On');
    const existing = ON.get(target);
    if (existing === undefined) ON.set(target, [...events]);
    else existing.push(...events);
  };
}

/**
 * Attach middleware that runs when the method is INVOKED through the
 * runtime (`this.invoke(...)` / `runtime.invoke(...)`) — auth guards and
 * the like. Source order is execution order when stacked. NOT valid on an
 * `@On` handler (events carry no state, so a guard there is meaningless —
 * the runtime rejects the combination at mount).
 *
 * @throws {RapidError} RAPID_CONFIG on an illegal placement.
 */
export function Use(
  ...middleware: RapidModuleInvokeMiddleware[]
): RapidModuleMethodDecorator {
  return (target, context) => {
    assertMethodContext(context, 'Use');
    // Decorators apply bottom-up; prepend so the top-most @Use runs first.
    const existing = USE.get(target) ?? [];
    USE.set(target, [...middleware, ...existing]);
  };
}

/** Mount-time reader: the events a method subscribes to. @internal */
export const onEventsOf = (method: object): readonly string[] | undefined =>
  ON.get(method);

/** Mount-time reader: the invoke middleware attached to a method. @internal */
export const middlewareOf = (
  method: object,
): readonly RapidModuleInvokeMiddleware[] | undefined => USE.get(method);
