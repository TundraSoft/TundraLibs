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
