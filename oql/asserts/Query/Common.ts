/**
 * Common Query Validation Utilities
 *
 * This module provides shared validation functions used across both DDL and DML query validators.
 * These are low-level validation helpers for common query properties like table names, schema names, etc.
 *
 * @module asserts/Query/Common
 */

/**
 * Validates that a table name is a non-empty string.
 * Used by both DDL (CREATE/ALTER/DROP TABLE) and DML (INSERT/UPDATE/DELETE/SELECT/UPSERT) validators.
 *
 * @param query - The query object containing the table property
 * @param context - Context string for error messages (e.g., 'CREATE_TABLE', 'INSERT')
 * @throws {TypeError} If table is missing, null, undefined, not a string, or empty
 *
 * @example
 * ```ts
 * const query = { table: 'users', ... };
 * assertTableName(query, 'INSERT'); // ✓
 *
 * const invalid = { table: '', ... };
 * assertTableName(invalid, 'INSERT'); // ✗ Throws
 * ```
 */
export const assertTableName = (
  query: Record<string, unknown>,
  context: string,
): void => {
  // Check if table property exists
  if (
    !('table' in query) || query.table === null || query.table === undefined
  ) {
    throw new TypeError(
      `Invalid ${context} query: 'table' is required`,
    );
  }

  // Validate it's a string
  if (typeof query.table !== 'string') {
    throw new TypeError(
      `Invalid ${context} query: 'table' must be a string, got ${typeof query
        .table}`,
    );
  }

  // Validate it's not empty
  if (query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'table' must be a non-empty string`,
    );
  }
};

/**
 * Validates an optional schema name.
 * Used by both DDL and DML validators where schema is an optional property.
 *
 * @param query - The query object that may contain a schema property
 * @param context - Context string for error messages (e.g., 'CREATE_TABLE', 'INSERT')
 * @throws {TypeError} If schema is provided but not a string or is empty
 *
 * @example
 * ```ts
 * const query = { table: 'users', schema: 'public', ... };
 * assertSchemaName(query, 'INSERT'); // ✓
 *
 * const noSchema = { table: 'users', ... };
 * assertSchemaName(noSchema, 'INSERT'); // ✓ Optional is fine
 *
 * const invalid = { table: 'users', schema: '', ... };
 * assertSchemaName(invalid, 'INSERT'); // ✗ Throws
 * ```
 */
export const assertSchemaName = (
  query: Record<string, unknown>,
  context: string,
): void => {
  // Schema is optional, so undefined is valid
  if (query.schema === undefined) {
    return;
  }

  // If provided, must be a string
  if (typeof query.schema !== 'string') {
    throw new TypeError(
      `Invalid ${context} query: 'schema' must be a string if provided, got ${typeof query
        .schema}`,
    );
  }

  // If provided, must not be empty
  if (query.schema.trim().length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'schema' must be a non-empty string if provided`,
    );
  }
};

/**
 * Validates the query type matches the expected type.
 * Used by all query validators to ensure type property is correct.
 *
 * @param query - The query object containing the type property
 * @param expectedType - The expected query type (e.g., 'INSERT', 'CREATE_TABLE')
 * @param context - Context string for error messages
 * @throws {TypeError} If type doesn't match the expected type
 *
 * @example
 * ```ts
 * const query = { type: 'INSERT', ... };
 * assertQueryType(query, 'INSERT', 'INSERT'); // ✓
 *
 * const wrong = { type: 'UPDATE', ... };
 * assertQueryType(wrong, 'INSERT', 'INSERT'); // ✗ Throws
 * ```
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
 * Validates columns array for DML queries.
 * Ensures it's a non-empty array of plain strings without @ prefix.
 * Used by INSERT, UPDATE, DELETE, UPSERT, SELECT, COUNT queries.
 *
 * @param query - The query object containing the columns property
 * @param context - Context string for error messages (e.g., 'INSERT', 'UPDATE')
 * @returns Array of validated column names
 * @throws {TypeError} If columns is missing, not an array, empty, or contains invalid values
 *
 * @example
 * ```ts
 * const query = { columns: ['id', 'name', 'email'], ... };
 * const cols = assertColumns(query, 'INSERT'); // ✓ Returns ['id', 'name', 'email']
 *
 * const invalid = { columns: ['@id', 'name'], ... };
 * assertColumns(invalid, 'INSERT'); // ✗ Throws (@ prefix not allowed)
 *
 * const empty = { columns: [], ... };
 * assertColumns(empty, 'INSERT'); // ✗ Throws (empty array)
 * ```
 */
export const assertColumns = (
  query: Record<string, unknown>,
  context: string,
): string[] => {
  // Check if columns property exists and is a non-empty array
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'columns' must be a non-empty array`,
    );
  }

  // Validate each column
  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid ${context} query: Each column in 'columns' must be a non-empty string`,
      );
    }

    // Columns should NOT have @ prefix (they are schema definitions, not references)
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid ${context} query: Columns should be plain strings without '@' prefix. Got '${col}'`,
      );
    }
  }

  return query.columns as string[];
};
