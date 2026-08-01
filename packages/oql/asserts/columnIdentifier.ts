/**
 * Column Identifier Validators
 *
 * This module provides validation functions for column identifiers in OQL.
 * Column identifiers are strings that reference database columns and must follow
 * specific formatting rules.
 *
 * ## Column Identifier Format
 *
 * A column identifier must:
 * - Be a string
 * - Start with '@' prefix
 * - Contain only alphanumeric characters and underscores
 * - Start with a letter or underscore (after the '@')
 * - For nested/joined columns, each segment must have its own '@' prefix
 *
 * ## Examples
 *
 * Valid simple columns:
 * - `@id`
 * - `@userName`
 * - `@_private`
 * - `@column123`
 *
 * Valid nested columns (for joins):
 * - `@user.@id`
 * - `@order.@item.@price`
 * - `@table1.@table2.@column`
 *
 * Invalid identifiers:
 * - `id` (missing '@')
 * - `@123abc` (starts with number)
 * - `@user-id` (contains hyphen)
 * - `@user id` (contains space)
 * - `@user.id` (nested but second segment missing '@')
 *
 * ## Column List Validation
 *
 * When a `columnList` is provided, the validator checks if the column
 * exists in the list. The column list should contain column names WITHOUT
 * the '@' prefix:
 *
 * ```ts
 * // Column list: ['id', 'name', 'user.email']
 * assertColumnIdentifier('@id', ['id', 'name', 'user.email']);
 * assertColumnIdentifier('@user.@email', ['id', 'name', 'user.email']);
 * assertColumnIdentifier('@age', ['id', 'name', 'user.email']);  // throws
 * ```
 *
 * @module asserts/ColumnIdentifier
 */

import type { ColumnIdentifier } from '../types/mod.ts';

/**
 * Asserts that a value is a valid column identifier.
 *
 * Validates the structure and format of a column identifier string.
 * Column identifiers must start with '@' and follow identifier naming rules.
 * For nested columns (joins), each segment must have its own '@' prefix.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation.
 *                     If provided, validates that the column exists in this list.
 *
 * @throws {TypeError} If the value is not a string
 * @throws {TypeError} If any segment doesn't start with '@'
 * @throws {TypeError} If any segment has an empty identifier after '@'
 * @throws {TypeError} If any segment has an invalid identifier pattern
 * @throws {TypeError} If columnList is provided and the column is not in the list
 *
 * @example
 * ```ts
 * // Simple column identifier
 * assertColumnIdentifier('@id');
 * assertColumnIdentifier('@userName');
 * assertColumnIdentifier('@_private');
 *
 * // Nested column identifier (for joins)
 * assertColumnIdentifier('@user.@id');
 * assertColumnIdentifier('@order.@item.@price');
 *
 * // With column list validation
 * const columns = ['id', 'name', 'email'];
 * assertColumnIdentifier('@id', columns);
 * assertColumnIdentifier('@age', columns);  // throws: not in column list
 *
 * // Nested column with column list
 * const joinedColumns = ['user.id', 'user.name', 'order.total'];
 * assertColumnIdentifier('@user.@id', joinedColumns);
 * assertColumnIdentifier('@user.@age', joinedColumns);  // throws: not in column list
 *
 * // Invalid identifiers
 * assertColumnIdentifier('id');  // throws: missing '@'
 * assertColumnIdentifier('@123abc');  // throws: starts with number
 * assertColumnIdentifier('@user-id');  // throws: contains hyphen
 * assertColumnIdentifier('@user.id');  // throws: second segment missing '@'
 * assertColumnIdentifier('@');  // throws: empty identifier
 * ```
 */
export const assertColumnIdentifier: (
  x: unknown,
  columnList?: string[],
) => asserts x is ColumnIdentifier = (
  x: unknown,
  columnList?: string[],
): asserts x is ColumnIdentifier => {
  if (typeof x !== 'string') {
    throw new TypeError(
      `Invalid ColumnIdentifier: Expected string, got ${typeof x}`,
    );
  }

  const parts = x.split('.');
  for (const part of parts) {
    // Should start with @
    if (!part.startsWith('@')) {
      throw new TypeError(
        `Invalid ColumnIdentifier: Segment "${part}" must start with '@'`,
      );
    }

    const identifier = part.slice(1); // Remove '@'

    if (identifier.trim().length === 0) {
      throw new TypeError(
        `Invalid ColumnIdentifier: Segment "${part}" has empty identifier after '@'`,
      );
    }
    // Match identifier pattern which is basically alphanumeric and underscores, starting with a letter or underscore
    const identifierPattern = /^[a-zA-Z_]\w*$/;
    if (!identifierPattern.test(identifier)) {
      throw new TypeError(
        `Invalid ColumnIdentifier: Segment "${part}" has invalid identifier "${identifier}"`,
      );
    }
  }
  // Distinct semantics:
  //   columnList === undefined → no constraint (any well-formed ref OK)
  //   columnList === []        → no columns are valid; reject any ref.
  //                              Used for contexts like INSERT VALUES
  //                              where there's no source row to reference.
  //   columnList === [...]     → only listed columns are valid.
  if (columnList !== undefined) {
    if (columnList.length === 0) {
      throw new TypeError(
        `ColumnIdentifier "${x}" is not in the provided column list`,
      );
    }
    const cleanColumn = parts.map((p) => p.slice(1)).join('.');

    // Check for exact match first
    if (columnList.includes(cleanColumn)) {
      return;
    }

    // Handle bidirectional matching for __base__ prefix
    let found = false;

    if (parts.length === 1) {
      // Simple column like @id - check if __base__.id exists in list
      const qualifiedColumn = `__base__.${cleanColumn}`;
      if (columnList.includes(qualifiedColumn)) {
        found = true;
      }
    } else if (parts.length === 2 && parts[0] === '@__base__') {
      // Qualified column like @__base__.@id - check if just id exists in list
      const simpleColumn = parts[1]!.slice(1); // Remove @ from second part
      if (columnList.includes(simpleColumn)) {
        found = true;
      }
    }

    if (!found) {
      throw new TypeError(
        `ColumnIdentifier "${x}" is not in the provided column list`,
      );
    }
  }
};

/**
 * Type guard to check if a value is a valid column identifier.
 *
 * Returns `true` if the value is a valid column identifier, `false` otherwise.
 * Does not throw errors - use for conditional checks and filtering.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid column identifier, `false` otherwise
 *
 * @example
 * ```ts
 * // Basic type checking
 * if (isColumnIdentifier('@id')) {
 *   // x is narrowed to ColumnIdentifier (string) type
 *   console.log('Valid column identifier');
 * }
 *
 * // Check various formats
 * isColumnIdentifier('@userName'); // true
 * isColumnIdentifier('@user.@id'); // true
 * isColumnIdentifier('@_private'); // true
 * isColumnIdentifier('id'); // false (missing '@')
 * isColumnIdentifier('@123abc'); // false (starts with number)
 * isColumnIdentifier(123); // false (not a string)
 *
 * // With column list validation
 * const columns = ['id', 'name', 'email'];
 * isColumnIdentifier('@id', columns); // true
 * isColumnIdentifier('@name', columns); // true
 * isColumnIdentifier('@age', columns); // false (not in list)
 *
 * // Filter arrays
 * const mixed: unknown[] = ['@id', 'invalid', '@name', 123, '@email'];
 * const validColumns = mixed.filter((x) => isColumnIdentifier(x));
 * // Result: ['@id', '@name', '@email']
 *
 * // Type narrowing in conditionals
 * const value: unknown = getUserInput();
 * if (isColumnIdentifier(value)) {
 *   // TypeScript knows value is ColumnIdentifier (string) here
 *   const withoutPrefix = value.slice(1);
 * }
 *
 * // Validate query columns
 * const availableColumns = ['id', 'name', 'email', 'createdAt'];
 * const queryColumn = '@userId';
 * if (!isColumnIdentifier(queryColumn, availableColumns)) {
 *   throw new Error('Invalid column in query');
 * }
 * ```
 */
export const isColumnIdentifier = (
  x: unknown,
  columnList?: string[],
): x is ColumnIdentifier => {
  try {
    assertColumnIdentifier(x, columnList);
    return true;
  } catch {
    return false;
  }
};
