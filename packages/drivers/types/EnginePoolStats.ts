/**
 * Connection pool statistics for monitoring pool health.
 *
 * - `total`: total resources currently held by the pool (idle + active)
 * - `active`: resources currently checked out and in use
 * - `idle`: resources currently held but not in use, available for acquire
 * - `waiting`: pending acquire calls queued because the pool is at max capacity
 *
 * @module
 */

export type EnginePoolStats = {
  /** Total number of resources held by the pool (idle + active). */
  total: number;
  /** Number of resources currently checked out. */
  active: number;
  /** Number of idle resources available for acquire. */
  idle: number;
  /** Number of pending acquire calls waiting for a resource. */
  waiting: number;
};
