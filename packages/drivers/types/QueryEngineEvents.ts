/**
 * Events emitted by any engine that executes queries — the SQL dialects
 * and MongoDB alike. Shared so `SQLEngineEvents` and `MongoEngineEvents`
 * declare an identical `query` / `slowQuery` pair.
 *
 * The payload is the full {@link EngineQueryResult}, which carries the
 * executed query **and its parameters** — treat it as sensitive when
 * logging, and never forward it verbatim across a metadata-only bus.
 *
 * @module
 */

import type { EngineQueryResult } from './EngineQueryResult.ts';

/**
 * The `query` / `slowQuery` observability pair, common to every
 * query-executing engine.
 */
export type QueryEngineEvents = {
  /** Emitted for every query that executed successfully. */
  query: (instanceId: string, result: EngineQueryResult) => void;
  /** Emitted for queries whose time exceeded `slowQueryThreshold`. */
  slowQuery: (instanceId: string, result: EngineQueryResult) => void;
};
