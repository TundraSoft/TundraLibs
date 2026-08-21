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
