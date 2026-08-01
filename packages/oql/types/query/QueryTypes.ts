/**
 * Data Manipulation Language (DML) query types.
 *
 * Operate on data within existing structures:
 * - `SELECT`: retrieve data.
 * - `INSERT`: add new rows from literal data.
 * - `INSERT_FROM_QUERY`: add new rows from a SELECT
 *   (`INSERT INTO … SELECT …`).
 * - `UPDATE`: modify existing rows.
 * - `UPSERT`: insert or update on conflict.
 * - `DELETE`: remove rows.
 * - `COUNT`: optimised row count.
 */
export type DMLQueries =
  | 'SELECT'
  | 'INSERT'
  | 'INSERT_FROM_QUERY'
  | 'UPDATE'
  | 'UPSERT'
  | 'DELETE'
  | 'COUNT';

/**
 * Data Definition Language (DDL) query types.
 *
 * Define and modify database structure:
 * - `CREATE_SCHEMA` / `DROP_SCHEMA`.
 * - `CREATE_TABLE` / `DROP_TABLE` / `ALTER_TABLE`.
 * - `CREATE_INDEX` / `DROP_INDEX`.
 * - `CREATE_VIEW` / `DROP_VIEW` / `ALTER_VIEW`.
 * - `REFRESH_MATERIALIZED_VIEW`.
 * - `TRUNCATE`.
 */
export type DDLQueries =
  | 'CREATE_SCHEMA'
  | 'DROP_SCHEMA'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'ALTER_TABLE'
  | 'TRUNCATE'
  | 'CREATE_INDEX'
  | 'DROP_INDEX'
  | 'CREATE_VIEW'
  | 'DROP_VIEW'
  | 'ALTER_VIEW'
  | 'REFRESH_MATERIALIZED_VIEW';

/** All supported query types (DML + DDL). */
export type QueryTypes = DMLQueries | DDLQueries;
