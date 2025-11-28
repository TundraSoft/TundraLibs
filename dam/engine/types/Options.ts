type EngineBasicOptions = {
  /** Database host */
  host: string;
  /** Database port */
  port: number;
  /** Database name */
  database: string;
  /** Database username */
  username: string;
  /** Database password */
  password: string;
};

type EngineSecurityOptions = {
  /** SSL configuration */
  ssl?: boolean | {
    /** CA certificate */
    ca?: string;
    /** Client certificate */
    cert?: string;
    /** Client key */
    key?: string;
    /** Whether to reject unauthorized SSL connections */
    rejectUnauthorized?: boolean;
  };
};

type EnginePoolOptions = {
  /** Maximum number of connections in pool */
  max?: number;
  /** Minimum number of connections in pool */
  min?: number;
};

export type EngineOptions =
  & {
    /** Id Generator */
    idGenerator?: (prefix?: string) => string;
    /** Slow query threshold in seconds */
    slowQueryThreshold: number;
    /** Transaction timeout - After this time, transaction will be rolledback */
    transactionTimeout: number;
    /** Auto rollback on query failure **/
    autoRollbackOnFailure: boolean;
    /** Connection idle timeout in seconds */
    idleTimeoutSeconds?: number;
    /** Pool Configuration */
    pool?: EnginePoolOptions;
  }
  & Partial<EngineBasicOptions>
  & EngineSecurityOptions;
