import type { ColumnTypes } from './ColumnTypes.ts';

/**
 * Table schema as a record of column names to their value types.
 * Used as a generic constraint everywhere a table's shape is known.
 */
export type TableType = Record<string, ColumnTypes>;
