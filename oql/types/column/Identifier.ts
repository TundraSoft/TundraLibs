/**
 * Represents a column reference in a database query.
 *
 * Column identifiers follow a specific format:
 * - Simple column: `$columnName` (e.g., `$id`, `$name`)
 * - Nested column: `$tableName.$columnName` (e.g., `$users.$email`)
 *
 * Used throughout the query system to reference database columns in a type-safe manner.
 *
 * @example
 * ```typescript
 * // Simple column reference
 * const idColumn: ColumnIdentifier = '$id';
 *
 * // Nested column reference
 * const userEmail: ColumnIdentifier = '$users.$email';
 * ```
 */
export type ColumnIdentifier = `$${string}` | `$${string}.$${string}`;
