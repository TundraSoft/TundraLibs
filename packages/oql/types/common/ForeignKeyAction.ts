/**
 * Foreign-key referential action — what happens to referencing
 * rows when the referenced row is deleted or updated.
 *
 * - **CASCADE**: automatically delete/update referencing rows.
 * - **SET_NULL**: set FK columns in referencing rows to `NULL`.
 * - **SET_DEFAULT**: set FK columns to their column default.
 * - **RESTRICT**: prevent the operation if referencing rows exist (default).
 * - **NO_ACTION**: same as `RESTRICT` but the check is deferred to
 *   end-of-transaction.
 */
export type ForeignKeyAction =
  | 'CASCADE'
  | 'SET_NULL'
  | 'SET_DEFAULT'
  | 'RESTRICT'
  | 'NO_ACTION';
