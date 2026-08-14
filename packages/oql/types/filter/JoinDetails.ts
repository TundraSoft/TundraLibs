import type { TableType } from '../common/TableType.ts';
import type { JoinFilter } from './JoinFilter.ts';

/**
 * Configuration for a single joined table.
 *
 * @template PT - Primary table schema.
 * @template LT - Linked tables schema.
 * @template JT - The joined table's own schema.
 */
export type JoinDetails<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
  JT extends TableType = TableType,
> = {
  /**
   * Physical table name to join, as it exists in the database.
   *
   * This is not the alias. The alias is the key this
   * {@link JoinDetails} is filed under in {@link Joins} — a
   * translator emits `JOIN <table> AS <key>` — and column references
   * elsewhere in the query (`'@Profile.@bio'`) address that key. The
   * two are independent, so a `Profile` alias may perfectly well
   * point at a `profiles` table.
   */
  table: string;
  schema?: string;
  /**
   * List of columns available from the joined table. Required for
   * validation in `WHERE`, `HAVING`, expressions, and aggregates.
   * Must explicitly list every column that will be referenced.
   *
   * @example
   * ```ts ignore
   * Profile: {
   *   table: 'profiles',
   *   columns: ['userId', 'bio', 'email'], // userId must be listed for join
   *   on: { '@Profile.@userId': '@id' },
   * }
   * ```
   */
  columns: Array<keyof JT>;
  on: JoinFilter<PT, LT>;
  type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
};
