/**
 * A query to be executed by an SQL or document engine.
 *
 * Use named parameters with `:name:` syntax — engine subclasses translate to
 * the native placeholder format (`$1`, `?`, etc.) automatically.
 *
 * @example
 * ```ts
 * const query: EngineQuery = {
 *   sql: 'SELECT * FROM users WHERE id = :id: AND active = :active:',
 *   params: { id: 1, active: true },
 * };
 * ```
 *
 * @module
 */

export type EngineQuery = {
  /** SQL text (or driver-native query body for document engines). */
  sql: string;
  /** Named parameters keyed by placeholder name. */
  params?: Record<string, unknown>;
  /** When set, the query runs on the reserved client of this transaction. */
  transactionId?: string;
} & Record<string, unknown>;
