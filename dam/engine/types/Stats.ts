/**
 * Engine connection pool statistics for monitoring pool health
 */
export type EnginePoolStats = {
  /** Total number of connections in the pool */
  totalConnections: number;
  /** Number of connections currently in use */
  activeConnections: number;
  /** Number of idle connections available for use */
  idleConnections: number;
  /** Number of requests waiting for a connection */
  waitingRequests: number;
};
