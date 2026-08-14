/**
 * Combined snapshot of pool and query statistics.
 *
 * @module
 */

import type { EnginePoolStats } from './EnginePoolStats.ts';
import type { EngineQueryStats } from './EngineQueryStats.ts';

/**
 * Point-in-time counters returned by an engine's `stats` getter. Values are
 * cumulative since the engine was constructed, not since it last connected.
 */
export type EngineStats = {
  /** Connection pool statistics. */
  pool: EnginePoolStats;
  /** Query execution statistics. */
  query: EngineQueryStats;
};
