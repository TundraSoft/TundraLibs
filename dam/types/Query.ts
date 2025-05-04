import type { DAMEngineError } from '../errors/mod.ts';

/**
 * Represents a database query with optional callbacks for chained execution.
 *
 * This is the core query interface used in all database operations. Queries can be:
 * - Simple: Just SQL and parameters
 * - Chained: Including callbacks that execute based on query success/failure
 *
 * @example Simple query
 * ```typescript
 * const query: Query = {
 *   id: 'get_users',
 *   sql: 'SELECT * FROM users WHERE active = :active:',
 *   params: { active: true }
 * };
 * ```
 *
 * @example Chained query with callbacks
 * ```typescript
 * const query: Query = {
 *   id: 'create_user',
 *   sql: 'INSERT INTO users (name, email) VALUES (:name:, :email:) RETURNING id',
 *   params: { name: 'John Doe', email: 'john@example.com' },
 *   onSuccess: (result) => {
 *     const userId = result.data[0]?.id;
 *     return {
 *       id: 'add_user_role',
 *       sql: 'INSERT INTO user_roles (user_id, role) VALUES (:userId:, :role:)',
 *       params: { userId, role: 'user' }
 *     };
 *   },
 *   onError: (error) => {
 *     return {
 *       id: 'log_error',
 *       sql: 'INSERT INTO error_log (message, source) VALUES (:message:, :source:)',
 *       params: { message: error.message, source: 'create_user' }
 *     };
 *   }
 * };
 * ```
 */
export type Query = {
  /**
   * Unique identifier for the query.
   * Will be auto-generated if not provided.
   */
  id?: string;

  /**
   * SQL statement to execute.
   * Can use `:paramName:` syntax for parameters.
   */
  sql: string;

  /**
   * Query parameters referenced in the SQL.
   * Can be a plain object or QueryParameters instance.
   */
  params?: Record<string, unknown>;

  /**
   * Called when query executes successfully.
   * Can return a follow-up query to be executed in a chain.
   *
   * @template T Row type of the query result
   * @param result The successful query result
   * @returns A follow-up query or undefined (to end the chain)
   */
  onSuccess?<T extends Record<string, unknown> = Record<string, unknown>>(
    result: QueryResult<T>,
  ): Promise<Query | undefined> | Query | undefined;

  /**
   * Called when query execution fails or if a downstream query fails.
   * Can return a fallback query to be executed.
   *
   * @param error The error that occurred during execution
   * @param previousResults Any successful results from earlier in the chain
   * @returns A fallback query or undefined (to end with error)
   */
  onError?(
    error: DAMEngineError,
    previousResults?: QueryResult[],
  ): Promise<Query | undefined> | Query | undefined;
};

/**
 * Represents the result of a database query execution.
 *
 * Contains the data returned by the query, execution statistics,
 * and optional metadata including the original query information.
 *
 * @template T The row type of the result data
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
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Unique identifier for the query execution */
  id: string;

  /** Execution time in milliseconds */
  time: number;

  /** Number of rows returned/affected by the query */
  count: number;

  /**
   * Result data rows returned by the query.
   * Type is specified by the template parameter T.
   */
  data: T[];

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
