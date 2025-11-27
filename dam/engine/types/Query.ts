export type EngineQuery = {
  sql: string;
  params?: Record<string, unknown>;
  transactionId?: string; // Optional transaction context for async-safe transactions
} & Record<string, unknown>; // Allow additional properties for NoSQL engines like MongoDB

export type EngineQueryResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  query: EngineQuery;
  data: R[];
  count: number;
  time: number; // Time taken to execute the query in seconds
  isSlow: boolean;
  transactionId?: string; // Transaction ID if query was executed within a transaction
};

/**
 * Basic transaction options that most engines support
 */
export type EngineTransactionOptions = {
  /** Transaction timeout in seconds - applies to entire transaction duration */
  timeout?: number;
  /** Transaction identifier (also used as name/label for monitoring) */
  name?: string;
};

/**
 * Transaction context provided to transaction callback functions.
 * Automatically manages transaction ID for all operations.
 */
export type EngineTransactionContext = {
  /**
   * Execute a query within this transaction context
   */
  execute: <R extends Record<string, unknown> = Record<string, unknown>>(
    query: Omit<EngineQuery, 'transactionId'>,
  ) => Promise<EngineQueryResult<R>>;

  /**
   * Convenience method for simple queries
   */
  query: <R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ) => Promise<EngineQueryResult<R>>;

  /**
   * Start a nested transaction (uses savepoints if supported)
   */
  transaction: <T>(
    callback: (tx: EngineTransactionContext) => Promise<T>,
    options?: EngineTransactionOptions,
  ) => Promise<T>;

  /**
   * Get the transaction ID (useful for debugging/logging)
   */
  readonly transactionId: string;
};
