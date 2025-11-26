/**
 * Base database connection options
 */
export type EngineDatabaseOptions = {
  /** Database host */
  host: string;
  /** Database port */
  port?: number;
  /** Database name */
  database: string;
  /** Database username */
  username: string;
  /** Database password */
  password?: string;
};

/**
 * SSL/TLS connection options
 */
export type EngineSecurityOptions = {
  /** SSL configuration */
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
};

/**
 * Advanced connection options
 */
export type EngineAdvancedOptions = {
  /** Application name for connection identification */
  applicationName?: string;
  /** Statement timeout in seconds */
  statementTimeout?: number;
  /** Idle session timeout in seconds */
  idleInTransactionSessionTimeout?: number;
};

/**
 * Connection pool options for database engines that support pooling
 */
export type EnginePoolOptions = {
  /** Maximum number of connections in pool (default: 10) */
  max?: number;
  /** Minimum number of connections in pool (default: 0) */
  min?: number;
  /** Connection idle timeout in seconds (default: 30) */
  idleTimeoutSeconds?: number;
  /** Maximum lifetime of connections in seconds (default: 0 - no limit) */
  maxLifetimeSeconds?: number;
  /** Allow exiting pool with active connections (default: false) */
  allowExitOnIdle?: boolean;
};

export type EngineOptions = {
  slowQueryThreshold?: number; // Threshold in seconds for slow queries. Supports decimal values.
  generateQueryId?: (prefix?: string) => string; // Function to generate a unique query ID
  connectionTimeout?: number; // Connection timeout in seconds
  queryTimeout?: number; // Query timeout in seconds
  maxConsecutiveErrors?: number; // Maximum consecutive errors before marking unhealthy
  healthCheckInterval?: number; // Health check interval in seconds
  transactionTimeout?: number; // Transaction timeout in seconds (default 30)
  // Basic pool options - engines delegate to their native pools
  minConnections?: number; // Minimum connections in pool
  maxConnections?: number; // Maximum connections in pool
  acquireTimeout?: number; // Time to wait for connection from pool in seconds
  idleTimeout?: number; // Time before idle connections are closed in seconds
};
