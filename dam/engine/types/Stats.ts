/**
 * Engine connection pool statistics for monitoring pool health
 */
export type EnginePoolStats = {
  /** Total number of connections in the pool */
  total: number;
  /** Number of connections currently in use */
  active: number;
  /** Number of idle connections available for use */
  idle: number;
  /** Number of requests waiting for a connection */
  waiting: number;
};

export type EngineQueryStats = {
  /** Total number of queries executed */
  totalQueries: number;
  /** Number of successful queries */
  successfulQueries: number;
  /** Number of failed queries */
  failedQueries: number;
  /** Number of slow queries exceeding the defined threshold */
  slowQueries: number;
  /** Average query execution time in milliseconds */
  averageExecutionTimeMs: number;
};

export type EngineStats = {
  /** Connection pool statistics */
  pool: EnginePoolStats;
  query: EngineQueryStats;
};
