import type { DAMEngineError } from '../../engines/errors/mod.ts';
import type { QueryParameters } from '../Parameters.ts';
import type { QueryResult } from './Result.ts';

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
  params?: Record<string, unknown> | QueryParameters;

  /**
   * Called when query executes successfully.
   * Can return a follow-up query to be executed in a chain.
   *
   * @template R Row type of the query result
   * @param result The successful query result
   * @returns A follow-up query or undefined (to end the chain)
   */
  onSuccess?<R extends Record<string, unknown> = Record<string, unknown>>(
    result: QueryResult<R>,
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
 * A Query that must have an ID.
 * Used in operations where queries must be uniquely identifiable.
 */
export type IdentifiedQuery = Query & { id: string };

export type { QueryResult } from './Result.ts';
