import type { SQLDataType } from '../common/SQLDataType.ts';

/** Properties common to every column-definition variant. */
type BaseColumnDefinition = {
  /** When true, the column accepts `NULL` values. Defaults to `true`. */
  nullable?: boolean;
  /** Optional description/comment for the column. */
  comment?: string;
};

/**
 * Column definition for `CREATE_TABLE` / `ALTER_TABLE`.
 *
 * Discriminated union — only valid properties are allowed for each
 * SQL data type:
 * - String types (`CHAR`, `VARCHAR`, `TEXT`, `CLOB`): allow `length`.
 * - Binary types (`BINARY`, `VARBINARY`, `BLOB`): allow `length`.
 * - Decimal types (`DECIMAL`, `NUMERIC`): allow `precision` + `scale`.
 * - Other types: base properties only (`nullable`, `comment`).
 *
 * @template T - TypeScript type this column represents (string,
 *   number, Date, …).
 *
 * @example
 * ```ts
 * // String column with length
 * const name: ColumnDefinition<string> = {
 *   type: 'VARCHAR', length: 255, nullable: false,
 * };
 *
 * // Decimal column with precision + scale
 * const price: ColumnDefinition<number> = {
 *   type: 'DECIMAL', precision: 10, scale: 2,
 * };
 *
 * // Date column — no length/precision/scale
 * const createdAt: ColumnDefinition<Date> = {
 *   type: 'TIMESTAMP', nullable: false, comment: 'Record creation timestamp',
 * };
 * ```
 */
export type ColumnDefinition<T = unknown> =
  | ({
    /** String SQL data type. */
    type: 'CHAR' | 'VARCHAR' | 'TEXT' | 'CLOB';
    /**
     * Maximum length in characters. Required for `CHAR` and
     * `VARCHAR` in most databases.
     */
    length?: number;
  } & BaseColumnDefinition)
  | ({
    /** Binary SQL data type. */
    type: 'BINARY' | 'VARBINARY' | 'BLOB';
    /**
     * Maximum length in bytes. Required for `BINARY` and
     * `VARBINARY` in most databases.
     */
    length?: number;
  } & BaseColumnDefinition)
  | ({
    /** Decimal SQL data type. */
    type: 'DECIMAL' | 'NUMERIC';
    /**
     * Total number of digits (integer + fractional). Required for
     * `DECIMAL`/`NUMERIC`.
     */
    precision?: number;
    /**
     * Digits after the decimal point. Must be ≤ `precision`.
     */
    scale?: number;
  } & BaseColumnDefinition)
  | ({
    /** Other SQL data types — no length / precision / scale. */
    type: Exclude<
      SQLDataType,
      | 'CHAR'
      | 'VARCHAR'
      | 'TEXT'
      | 'CLOB'
      | 'BINARY'
      | 'VARBINARY'
      | 'BLOB'
      | 'DECIMAL'
      | 'NUMERIC'
    >;
  } & BaseColumnDefinition);
