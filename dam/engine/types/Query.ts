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
