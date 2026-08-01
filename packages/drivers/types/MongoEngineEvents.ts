/**
 * Events specific to the MongoDB engine, on top of `EngineEvents`.
 *
 * Mongo executes queries (so it emits `query` / `slowQuery` like the SQL
 * engines) but exposes no transaction surface yet, so — unlike
 * `SQLEngineEvents` — it adds no `transaction*` events.
 *
 * @module
 */

import type { EngineEvents } from './EngineEvents.ts';
import type { QueryEngineEvents } from './QueryEngineEvents.ts';

/**
 * MongoDB engine event surface: the connection-lifecycle events from
 * {@link EngineEvents} plus the {@link QueryEngineEvents} observability
 * pair.
 *
 * @see {@link EngineEvents}
 * @see {@link QueryEngineEvents}
 */
export type MongoEngineEvents = EngineEvents & QueryEngineEvents;
