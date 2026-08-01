/**
 * The handle passed to a callback-style `engine.transaction(fn)`. The
 * transaction's connection is tied to the callback: it is acquired on
 * entry and released (commit on resolve, rollback on throw) on exit, so
 * it can never leak from the pool.
 *
 * @module
 */

import type { EngineQuery } from './EngineQuery.ts';
import type { EngineQueryResult } from './EngineQueryResult.ts';

/**
 * A live transaction scope. Everything run through it executes on the
 * one reserved connection; nesting opens a `SAVEPOINT`.
 */
export type TransactionScope = {
  /** The transaction id — appears on `query` events for correlation. */
  readonly id: string;
  /**
   * Run a query on this transaction's connection. A statement failure
   * rolls back to the nearest enclosing savepoint (or the whole
   * transaction if there is none) and rejects.
   */
  execute<R extends Record<string, unknown> = Record<string, unknown>>(
    query: EngineQuery,
  ): Promise<EngineQueryResult<R>>;
  /**
   * Run `fn` in a nested `SAVEPOINT`. On resolve its writes fold into
   * the surrounding transaction; on throw only its work is rolled back
   * (to the savepoint) and the error is rethrown — so the enclosing
   * transaction survives and you can `try/catch` to continue it.
   */
  transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T>;
};
