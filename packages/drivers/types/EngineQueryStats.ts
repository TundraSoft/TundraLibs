/**
 * Aggregate query execution statistics for an SQL-style engine.
 *
 * @module
 */

export type EngineQueryStats = {
  /** Total queries attempted (success + failure). */
  totalQueries: number;
  /** Queries that completed without error. */
  successfulQueries: number;
  /** Queries that threw. */
  failedQueries: number;
  /** Queries whose `time` exceeded `slowQueryThreshold`. */
  slowQueries: number;
  /** Rolling average wall-clock query time in milliseconds. */
  averageExecutionTimeMs: number;
};
