/**
 * Result of executing an `EngineQuery`.
 *
 * @module
 */

import type { EngineQuery } from './EngineQuery.ts';

/**
 * Result of executing an `EngineQuery`.
 *
 * @template R - Row shape (defaults to a generic record).
 */
export type EngineQueryResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Unique identifier for this query execution. */
  id: string;
  /** The (possibly standardized) query that was executed. */
  query: EngineQuery;
  /** Returned rows. Empty array for non-result queries. */
  data: R[];
  /** Number of rows affected (for DML) or returned (for SELECT). */
  count: number;
  /** Total execution time in milliseconds (wall clock). */
  time: number;
  /** True if `time` exceeded the engine's slow-query threshold. */
  isSlow: boolean;
  /** Transaction id when the query ran inside a transaction. */
  transactionId?: string;
};
