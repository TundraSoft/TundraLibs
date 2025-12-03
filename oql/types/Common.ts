/**
 * Internal helper type for column types.
 * Represents a column's possible value types, including nullable variants.
 *
 * All base types can be nullable to support database NULL values.
 *
 * @internal
 */
export type ColumnTypes =
  | string
  | number
  | bigint
  | Date
  | boolean
  | Record<string, unknown>
  | null;

/**
 * Internal helper type for table schemas.
 * Represents a table as a record of column names to their value types.
 *
 * @internal
 */
export type TableType = Record<string, ColumnTypes>;

/**
 * Helper type to filter table columns by their value type.
 *
 * Returns column names (keys) whose values match the specified type.
 * If no columns match, returns all column names as a fallback.
 *
 * @template T - Table schema (record of column names to types)
 * @template V - Value type to filter by (string, number, Date, etc.)
 *
 * @example
 * ```typescript
 * type User = {
 *   id: number;
 *   name: string;
 *   email: string;
 *   age: number;
 *   createdAt: Date;
 * };
 *
 * // Get only numeric columns
 * type NumericCols = GetColumnByType<User, number>;
 * // Result: 'id' | 'age'
 *
 * // Get only string columns
 * type StringCols = GetColumnByType<User, string>;
 * // Result: 'name' | 'email'
 *
 * // Get only date columns
 * type DateCols = GetColumnByType<User, Date>;
 * // Result: 'createdAt'
 *
 * // No boolean columns exist - returns all keys as fallback
 * type BoolCols = GetColumnByType<User, boolean>;
 * // Result: 'id' | 'name' | 'email' | 'age' | 'createdAt'
 * ```
 */
export type GetColumnByType<T extends TableType, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T] extends never ? keyof T : {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Column identifier pattern used in queries.
 * Supports two formats:
 * - `@columnName` - Direct column reference
 * - `@tableName.@columnName` - Qualified column reference with table prefix
 *
 * Note: Due to TypeScript limitations, this type cannot fully prevent patterns like
 * `@table.column` (missing @ on column). Runtime validation is needed for strict checks.
 *
 * @example
 * ```typescript
 * const col1: ColumnIdentifier = '@id';              // Valid
 * const col2: ColumnIdentifier = '@users.@id';       // Valid
 * const col3: ColumnIdentifier = '@Profile.@email';  // Valid
 * // const invalid: ColumnIdentifier = 'id';         // Error: missing @
 * ```
 */
export type ColumnIdentifier = `@${string}`;
