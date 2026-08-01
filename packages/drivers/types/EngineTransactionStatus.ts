/**
 * Lifecycle status of a single transaction tracked by `SQLEngine`.
 *
 * - `ACTIVE`: BEGIN succeeded; the transaction is in progress.
 * - `COMMITTING`: COMMIT was issued and is awaiting server confirmation.
 *   New `execute()` calls with this transaction id are refused until the
 *   in-flight commit resolves to `COMMITTED` or fails.
 * - `ROLLING_BACK`: ROLLBACK was issued (explicit or via timeout) and is
 *   awaiting server confirmation. New `execute()` calls with this
 *   transaction id are refused.
 * - `COMMITTED`: COMMIT succeeded.
 * - `ROLLBACK`: explicit ROLLBACK happened.
 * - `TIMEOUT`: transaction exceeded `transactionTimeout` and was auto-rolled back.
 *
 * @module
 */

export type EngineTransactionStatus =
  | 'ACTIVE'
  | 'COMMITTING'
  | 'ROLLING_BACK'
  | 'COMMITTED'
  | 'ROLLBACK'
  | 'TIMEOUT';
