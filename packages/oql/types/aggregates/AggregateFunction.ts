/**
 * Aggregate function names supported across Postgres, MariaDB,
 * SQLite, and MongoDB.
 *
 * - `COUNT`: count rows or distinct values.
 * - `SUM`: sum numeric values.
 * - `MIN`: minimum value.
 * - `MAX`: maximum value.
 * - `AVG`: average value.
 * - `STRING_AGG`: concatenate string values with a delimiter.
 * - `ARRAY_AGG`: collect values into an array.
 * - `JSON_ROW`: aggregate columns into a JSON object.
 */
export type AggregateFunction =
  | 'COUNT'
  | 'SUM'
  | 'MIN'
  | 'MAX'
  | 'AVG'
  | 'STRING_AGG'
  | 'ARRAY_AGG'
  | 'JSON_ROW';
