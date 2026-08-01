/**
 * Options for SQL-style engines, on top of `EngineOptions`.
 *
 * @module
 */

import type { EngineOptions } from './EngineOptions.ts';

export type SQLEngineOptions = EngineOptions & {
  /**
   * Wall-clock duration in seconds above which a query is considered slow
   * and emits the `slowQuery` event. Default: 0.5.
   */
  slowQueryThreshold?: number;
  /**
   * Maximum duration in seconds a transaction may remain `ACTIVE` before
   * being auto-rolled back. Default: 120.
   */
  transactionTimeout?: number;
  /**
   * If `true`, a query that fails inside a transaction triggers an automatic
   * rollback of that transaction. Default: `true`.
   */
  autoRollbackOnFailure?: boolean;
};
