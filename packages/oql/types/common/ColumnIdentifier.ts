/**
 * Column identifier pattern used in queries.
 *
 * Supports two formats:
 * - `@columnName` — direct column reference.
 * - `@tableName.@columnName` — qualified column reference with
 *   table prefix.
 *
 * Note: due to TypeScript template-literal limitations, this type
 * can't fully prevent patterns like `@table.column` (missing `@` on
 * the column part). Runtime validation is needed for strict checks.
 *
 * @example
 * ```ts
 * const col1: ColumnIdentifier = '@id';              // OK
 * const col2: ColumnIdentifier = '@users.@id';       // OK
 * const col3: ColumnIdentifier = '@Profile.@email';  // OK
 * // const bad: ColumnIdentifier = 'id';             // ❌ missing '@'
 * ```
 */
export type ColumnIdentifier = `@${string}`;
