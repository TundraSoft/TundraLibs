/**
 * @fileoverview `@On(...events)` — subscribe a module method to events
 * published by other modules. Metadata-only: recorded in the registry,
 * validated against the mounted declarations when the runtime finalizes.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import { EVENT_NAME_PATTERN } from '../modules/events.ts';
import type { RapidModuleMethodDecorator } from '../types/mod.ts';
import { assertMethodContext, recordOn } from './registry.ts';

/**
 * Subscribe the decorated method to one or more fully-qualified events
 * (`namespace:Module:EventName`). The handler receives `(payload, ctx)`
 * where `ctx` is an `EventContext` (correlation only — no state, no
 * middleware); each delivery is isolated from the others. An `@On`
 * handler is NOT invokable and may not carry `@Use`.
 *
 * @throws {RapidError} RAPID_CONFIG at decoration when no event is given
 *   or a name does not match the grammar; at finalize when the event is
 *   not declared by any mounted module.
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
    recordOn(target, events);
  };
}
