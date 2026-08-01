/**
 * Combined snapshot of pool and query statistics.
 *
 * @module
 */

import type { EnginePoolStats } from './EnginePoolStats.ts';
import type { EngineQueryStats } from './EngineQueryStats.ts';

export type EngineStats = {
  /** Connection pool statistics. */
  pool: EnginePoolStats;
  /** Query execution statistics. */
  query: EngineQueryStats;
};
