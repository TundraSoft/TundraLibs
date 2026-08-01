/**
 * Shared query-property validators used by both DDL and DML asserts.
 *
 * @module asserts/Query/Common
 */

/**
 * Asserts `query.table` exists and is a non-empty string.
 *
 * @param query - The query object containing the `table` property
 * @param context - Context label included in error messages (e.g. `INSERT`)
 */
export const assertTableName = (
  query: Record<string, unknown>,
  context: string,
): void => {
  if (
    !('table' in query) || query.table === null || query.table === undefined
  ) {
    throw new TypeError(`Invalid ${context} query: 'table' is required`);
  }
  if (typeof query.table !== 'string') {
    throw new TypeError(
      `Invalid ${context} query: 'table' must be a string, got ${typeof query
        .table}`,
    );
  }
  if (query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'table' must be a non-empty string`,
    );
  }
};

/**
 * Asserts that `query.schema`, if present, is a non-empty string.
 *
 * @param query - The query object that may contain a `schema` property
 * @param context - Context label included in error messages
 */
export const assertSchemaName = (
  query: Record<string, unknown>,
  context: string,
): void => {
  if (query.schema === undefined) return;

  if (typeof query.schema !== 'string') {
    throw new TypeError(
      `Invalid ${context} query: 'schema' must be a string if provided, got ${typeof query
        .schema}`,
    );
  }
  if (query.schema.trim().length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'schema' must be a non-empty string if provided`,
    );
  }
};

/**
 * Asserts that `query.type` matches `expectedType`.
 *
 * @param query - The query object containing the `type` property
 * @param expectedType - The exact type value the query is expected to have
 * @param context - Context label included in error messages
 */
export const assertQueryType = (
  query: Record<string, unknown>,
  expectedType: string,
  context: string,
): void => {
  if (query.type !== expectedType) {
    throw new TypeError(
      `Invalid ${context} query: Expected type '${expectedType}', got '${query.type}'`,
    );
  }
};

/**
 * Asserts that `query.columns` is a non-empty array of plain (non-`@`-prefixed)
 * strings, and returns the array. The `@` prefix is reserved for column
 * references; column declarations are plain names.
 *
 * @param query - The query object containing the `columns` property
 * @param context - Context label included in error messages
 * @returns The validated `columns` array
 */
export const assertColumns = (
  query: Record<string, unknown>,
  context: string,
): string[] => {
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'columns' must be a non-empty array`,
    );
  }

  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid ${context} query: Each column in 'columns' must be a non-empty string`,
      );
    }
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid ${context} query: Columns should be plain strings without '@' prefix. Got '${col}'`,
      );
    }
  }

  return query.columns as string[];
};
