import type { FlattenEntity } from '@tundralibs/utils';
import type { GetColumnByType } from '../common/GetColumnByType.ts';
import type { TableType } from '../common/TableType.ts';
import type { Expressions } from '../expressions/Expressions.ts';
import type { NumericExpressions } from '../expressions/NumericExpressions.ts';
import type { AggregateFunction } from './AggregateFunction.ts';

/**
 * Aggregate definitions for database queries — discriminated by
 * `$$_aggregate`. Each branch enforces the legal shape for that
 * aggregate variant.
 *
 * @template T  - Table schema.
 * @template FT - Flattened table schema with `'@'` prefix.
 *
 * **COUNT** — rows or distinct column values.
 * ```ts
 * { $$_aggregate: 'COUNT' }                               // COUNT(*)
 * { $$_aggregate: 'COUNT', column: '@id' }                 // COUNT(column)
 * { $$_aggregate: 'COUNT', column: '@id', distinct: true } // COUNT(DISTINCT column)
 * ```
 *
 * **Numeric (SUM/MIN/MAX/AVG)** — operate on number/bigint/Date.
 * ```ts
 * { $$_aggregate: 'SUM', column: '@amount' }
 * { $$_aggregate: 'AVG', column: '@price', distinct: true }
 * { $$_aggregate: 'MIN', column: '@createdAt' }
 * ```
 *
 * **STRING_AGG** — concatenate string values with a delimiter.
 * ```ts
 * { $$_aggregate: 'STRING_AGG', column: '@name',  separator: ', ' }
 * { $$_aggregate: 'STRING_AGG', column: '@email', separator: ';', distinct: true }
 * ```
 *
 * **ARRAY_AGG** — collect values into an array.
 * ```ts
 * { $$_aggregate: 'ARRAY_AGG', column: '@id' }
 * { $$_aggregate: 'ARRAY_AGG', column: '@tag', distinct: true }
 * ```
 *
 * **JSON_ROW** — aggregate columns into a JSON object with custom keys.
 * ```ts
 * {
 *   $$_aggregate: 'JSON_ROW',
 *   columns: { userId: '@id', userName: '@name', userEmail: '@email' },
 * }
 * ```
 */
export type Aggregates<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> = {
  /** `COUNT(*)` — count all rows. */
  $$_aggregate: 'COUNT';
  column?: never;
  distinct?: never;
} | {
  /** `COUNT(column)` or `COUNT(DISTINCT column)`. */
  $$_aggregate: 'COUNT';
  column: keyof FT | Expressions<T, FT>;
  distinct?: boolean;
} | {
  /** Numeric aggregates: `SUM`, `MIN`, `MAX`, `AVG`. */
  $$_aggregate: Exclude<
    AggregateFunction,
    'COUNT' | 'JSON_ROW' | 'STRING_AGG' | 'ARRAY_AGG'
  >;
  column:
    | GetColumnByType<FT, number | bigint | Date>
    | Extract<Expressions<T, FT>, { $$_expression: NumericExpressions }>;
  /** Apply `DISTINCT` to the column before aggregating. */
  distinct?: boolean;
} | {
  /**
   * `STRING_AGG` — concatenate string values with a delimiter.
   *
   * Database-specific implementations:
   * - PostgreSQL: `string_agg(column, separator)`.
   * - MariaDB/MySQL: `GROUP_CONCAT(column SEPARATOR separator)`.
   * - SQLite: `group_concat(column, separator)`.
   * - MongoDB: `$reduce` with `$concat` (4.4+) or `$push` + join
   *   in the application layer.
   */
  $$_aggregate: 'STRING_AGG';
  column: keyof FT | Expressions<T, FT>;
  /** Delimiter between values (default: `','`). */
  separator?: string;
  /** Apply `DISTINCT` to remove duplicates before aggregating. */
  distinct?: boolean;
} | {
  /**
   * `ARRAY_AGG` — collect values into an array.
   *
   * Database-specific implementations:
   * - PostgreSQL: `array_agg(column)` or `json_agg(column)`.
   * - MariaDB/MySQL: `JSON_ARRAYAGG(column)`.
   * - SQLite: `json_group_array(column)`.
   * - MongoDB: `$push`.
   */
  $$_aggregate: 'ARRAY_AGG';
  column: keyof FT | Expressions<T, FT>;
  /** Apply `DISTINCT` to remove duplicates before aggregating. */
  distinct?: boolean;
} | {
  /**
   * `JSON_ROW` — aggregate columns into a JSON object with custom
   * keys.
   *
   * Database-specific implementations:
   * - PostgreSQL: `json_build_object()`.
   * - MariaDB/MySQL: `JSON_OBJECT()`.
   * - SQLite: `json_object()`.
   * - MongoDB: `$project` with field mapping.
   */
  $$_aggregate: 'JSON_ROW';
  columns: Record<string, keyof FT | Expressions<T, FT>>;
  distinct?: never;
};
