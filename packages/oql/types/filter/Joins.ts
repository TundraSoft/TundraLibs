import type { TableType } from '../common/TableType.ts';
import type { JoinDetails } from './JoinDetails.ts';

/**
 * Map of join name to {@link JoinDetails}. Each entry contributes
 * one joined table to the query.
 *
 * @template PT - Primary table schema.
 * @template LT - Linked tables schema.
 */
export type Joins<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
> = {
  [K in keyof LT]?: JoinDetails<PT, LT, LT[K]>;
};
