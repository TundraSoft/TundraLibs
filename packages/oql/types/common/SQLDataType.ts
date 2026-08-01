/**
 * Common SQL data types supported across most database systems.
 *
 * Categorised by family:
 * - **String types**: `CHAR`, `VARCHAR`, `TEXT`, `CLOB`.
 * - **Numeric types**: `TINYINT`, `SMALLINT`, `INTEGER`, `INT`,
 *   `BIGINT`, `DECIMAL`, `NUMERIC`, `FLOAT`, `DOUBLE`, `REAL`.
 * - **Binary types**: `BINARY`, `VARBINARY`, `BLOB`.
 * - **Date/Time types**: `DATE`, `TIME`, `DATETIME`, `TIMESTAMP`.
 * - **Boolean types**: `BOOLEAN`, `BIT`.
 * - **Special types**: `JSON`, `JSONB`, `UUID`, `XML`.
 *
 * Database-specific types (e.g. PostgreSQL arrays, geometry types)
 * are excluded to keep the surface cross-database compatible.
 */
export type SQLDataType =
  // String types
  | 'CHAR'
  | 'VARCHAR'
  | 'TEXT'
  | 'CLOB'
  // Numeric types — integers
  | 'TINYINT'
  | 'SMALLINT'
  | 'INTEGER'
  | 'INT'
  | 'BIGINT'
  // Numeric types — decimals
  | 'DECIMAL'
  | 'NUMERIC'
  | 'FLOAT'
  | 'DOUBLE'
  | 'REAL'
  // Binary types
  | 'BINARY'
  | 'VARBINARY'
  | 'BLOB'
  // Date/Time types
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'TIMESTAMP'
  | 'TIMESTAMPTZ'
  // Boolean types
  | 'BOOLEAN'
  | 'BIT'
  // Special types
  | 'JSON'
  | 'JSONB'
  | 'UUID'
  | 'XML';
