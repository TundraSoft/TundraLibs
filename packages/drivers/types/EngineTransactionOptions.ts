/**
 * Options accepted by `beginTransaction()` on an SQL engine.
 *
 * @module
 */

export type EngineTransactionOptions = {
  /** Override the engine's default `transactionTimeout` for this transaction (seconds). */
  timeout?: number;
  /** Stable name for the transaction (also used as the transaction id). */
  name?: string;
};
