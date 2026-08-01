import type { TableType } from './TableType.ts';

/**
 * Filter table columns by their value type. Returns column names
 * (keys) whose values match `V`. Falls back to all column names
 * when nothing matches — handy for keeping query types
 * non-`never` in edge cases.
 *
 * @template T - Table schema (record of column names to types).
 * @template V - Value type to filter by (string, number, Date, etc.).
 *
 * @example
 * ```ts
 * type User = { id: number; name: string; email: string; age: number; createdAt: Date };
 *
 * type NumericCols = GetColumnByType<User, number>; // 'id' | 'age'
 * type StringCols  = GetColumnByType<User, string>; // 'name' | 'email'
 * type DateCols    = GetColumnByType<User, Date>;   // 'createdAt'
 * type BoolCols    = GetColumnByType<User, boolean>; // fallback: every key
 * ```
 */
export type GetColumnByType<T extends TableType, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T] extends never ? keyof T : {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];
