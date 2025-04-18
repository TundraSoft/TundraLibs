import { DAMEngineError } from '../../engines/errors/mod.ts';

/**
 * Represents the result of a database query execution.
 *
 * Contains the data returned by the query, execution statistics,
 * and optional metadata including the original query information.
 *
 * @template R The row type of the result data
 *
 * @example
 * ```typescript
 * // Query result for a user lookup
 * const result: QueryResult<{ id: number, name: string }> = await engine.query({
 *   sql: 'SELECT id, name FROM users WHERE id = :id:',
 *   params: { id: 1 }
 * });
 *
 * console.log(`User: ${result.data[0]?.name}`);
 * console.log(`Execution time: ${result.time}ms`);
 * ```
 */
export type QueryResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Unique identifier for the query execution */
  id: string;

  /** Execution time in milliseconds */
  time: number;

  /** Number of rows returned/affected by the query */
  count: number;

  /**
   * Result data rows returned by the query.
   * Type is specified by the template parameter R.
   */
  data: R[];

  /** The original SQL statement (for debugging and logging) */
  sql?: string;

  /**
   * Parameters used in the query execution.
   * Always stored as a plain object, even if originally passed as QueryParameters.
   */
  params?: Record<string, unknown>;

  /** Error information if the query failed but was caught internally */
  error?: DAMEngineError;
};
