/**
 * Events specific to the Redis engine, on top of `EngineEvents`.
 *
 * Redis runs commands (so it emits the {@link QueryEngineEvents}
 * `query` / `slowQuery` pair, where a "query" is a Redis command) but
 * has no SQL transaction surface, so it adds no `transaction*` events.
 *
 * @module
 */

import type { EngineEvents } from './EngineEvents.ts';
import type { QueryEngineEvents } from './QueryEngineEvents.ts';

/**
 * Redis engine event surface: the connection-lifecycle events from
 * {@link EngineEvents} plus the {@link QueryEngineEvents} observability
 * pair (each command is reported as a `query`).
 *
 * @see {@link EngineEvents}
 * @see {@link QueryEngineEvents}
 */
export type RedisEngineEvents = EngineEvents & QueryEngineEvents;
