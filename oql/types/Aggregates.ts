import { FlattenEntity } from '@tundralibs/utils';
import { GetColumnByType, TableType } from './Common.ts';
import type { Expressions, NumericExpressions } from './Expressions.ts';

/**
 * Aggregate function types supported across Postgres, MariaDB, SQLite, and MongoDB.
 *
 * - `COUNT`: Count rows or distinct values
 * - `SUM`: Sum numeric values
 * - `MIN`: Minimum value
 * - `MAX`: Maximum value
 * - `AVG`: Average value
 * - `STRING_AGG`: Concatenate string values with delimiter
 * - `ARRAY_AGG`: Collect values into an array
 * - `JSON_ROW`: Aggregate columns into JSON object
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

/**
 * Aggregate definitions for database queries.
 *
 * @template T - Table schema
 * @template FT - Flattened table schema with '@' prefix
 *
 * Supports multiple aggregate types:
 *
 * **COUNT**: Count rows or distinct column values
 * ```typescript
 * { type: 'COUNT' }                           // COUNT(*)
 * { type: 'COUNT', column: '@id' }            // COUNT(column)
 * { type: 'COUNT', column: '@id', distinct: true }  // COUNT(DISTINCT column)
 * ```
 *
 * **Numeric Aggregates** (SUM, MIN, MAX, AVG): Operate on number/bigint/Date columns
 * ```typescript
 * { type: 'SUM', column: '@amount' }
 * { type: 'AVG', column: '@price', distinct: true }
 * { type: 'MIN', column: '@createdAt' }
 * ```
 *
 * **STRING_AGG**: Concatenate string values with a delimiter
 * ```typescript
 * { type: 'STRING_AGG', column: '@name', separator: ', ' }
 * { type: 'STRING_AGG', column: '@email', separator: ';', distinct: true }
 * ```
 *
 * **ARRAY_AGG**: Collect values into an array
 * ```typescript
 * { type: 'ARRAY_AGG', column: '@id' }
 * { type: 'ARRAY_AGG', column: '@tag', distinct: true }
 * ```
 *
 * **JSON_ROW**: Aggregate multiple columns into a JSON object with custom keys
 * ```typescript
 * {
 *   type: 'JSON_ROW',
 *   columns: {
 *     userId: '@id',
 *     userName: '@name',
 *     userEmail: '@email'
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Count all rows
 * const count: Aggregates = { type: 'COUNT' };
 *
 * // Sum with distinct
 * const sum: Aggregates<{ amount: number }> = {
 *   type: 'SUM',
 *   column: '@amount',
 *   distinct: true
 * };
 *
 * // JSON object aggregation
 * const jsonRow: Aggregates<{ id: number; name: string }> = {
 *   type: 'JSON_ROW',
 *   columns: {
 *     identifier: '@id',
 *     fullName: '@name'
 *   }
 * };
 * ```
 */
export type Aggregates<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> = {
  /** COUNT(*) - Count all rows */
  type: 'COUNT';
  column?: never;
  distinct?: never;
} | {
  /** COUNT(column) or COUNT(DISTINCT column) - Count column values or expressions */
  type: 'COUNT';
  column: keyof FT | Expressions<T, FT>;
  distinct?: boolean;
} | {
  /** Numeric aggregates: SUM, MIN, MAX, AVG - Supports columns or numeric expressions */
  type: Exclude<
    AggregateFunction,
    'COUNT' | 'JSON_ROW' | 'STRING_AGG' | 'ARRAY_AGG'
  >;
  column:
    | GetColumnByType<FT, number | bigint | Date>
    | Extract<Expressions<T, FT>, { type: NumericExpressions }>;
  /** Apply DISTINCT to the column before aggregating */
  distinct?: boolean;
} | {
  /**
   * STRING_AGG - Concatenate string values with a delimiter.
   *
   * Collects multiple string values and joins them with a specified separator.
   * Supports both column references and string expressions.
   *
   * Database-specific implementations:
   * - PostgreSQL: `string_agg(column, separator)`
   * - MariaDB/MySQL: `GROUP_CONCAT(column SEPARATOR separator)`
   * - SQLite: `group_concat(column, separator)`
   * - MongoDB: `$reduce` with `$concat` (MongoDB 4.4+) or `$push` to array then join in application
   */
  type: 'STRING_AGG';
  column: keyof FT | Expressions<T, FT>;
  /** Delimiter to use between values (default: ',') */
  separator?: string;
  /** Apply DISTINCT to remove duplicate values before aggregating */
  distinct?: boolean;
} | {
  /**
   * ARRAY_AGG - Collect values into an array.
   *
   * Aggregates multiple values into a single array/JSON array.
   * Supports both column references and expressions.
   *
   * Database-specific implementations:
   * - PostgreSQL: `array_agg(column)` or `json_agg(column)`
   * - MariaDB/MySQL: `JSON_ARRAYAGG(column)`
   * - SQLite: `json_group_array(column)`
   * - MongoDB: `$push` operator
   */
  type: 'ARRAY_AGG';
  column: keyof FT | Expressions<T, FT>;
  /** Apply DISTINCT to remove duplicate values before aggregating */
  distinct?: boolean;
} | {
  /**
   * JSON_ROW - Aggregate columns into a JSON object.
   *
   * Maps custom property names to column references or expressions.
   * Useful for creating structured JSON results with renamed fields.
   *
   * Database-specific implementations:
   * - PostgreSQL: `json_build_object()`
   * - MariaDB/MySQL: `JSON_OBJECT()`
   * - SQLite: `json_object()`
   * - MongoDB: `$project` with field mapping
   */
  type: 'JSON_ROW';
  columns: Record<string, keyof FT | Expressions<T, FT>>;
  distinct?: never;
};
