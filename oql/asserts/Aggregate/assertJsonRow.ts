import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import { assertExpression } from '../Expression/mod.ts';

/**
 * Asserts that a value is a valid JSON_ROW aggregate.
 *
 * JSON_ROW requires:
 * - `type`: 'JSON_ROW'
 * - `columns`: A record mapping output keys to ColumnIdentifiers or Expressions
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid JSON_ROW aggregate
 *
 * @example
 * ```typescript
 * assertJsonRow({
 *   type: 'JSON_ROW',
 *   columns: { userId: '@id', userName: '@name' }
 * });  // OK
 *
 * assertJsonRow({
 *   type: 'JSON_ROW',
 *   columns: { id: '@user.@id', email: '@user.@email' }
 * });  // OK
 *
 * assertJsonRow({ type: 'JSON_ROW' });  // Throws - missing columns
 * assertJsonRow({ type: 'JSON_ROW', columns: [] });  // Throws - columns must be object
 * assertJsonRow({ type: 'JSON_ROW', columns: {} });  // Throws - columns cannot be empty
 * ```
 */
export function assertJsonRow(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'JSON_ROW';
  columns: Record<string, string | object>;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid JSON_ROW aggregate: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  if (obj.type !== 'JSON_ROW') {
    throw new TypeError(
      customMessage ?? `Invalid JSON_ROW aggregate: type must be 'JSON_ROW'`,
    );
  }

  // Check for invalid properties
  const validProps = ['type', 'columns'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid JSON_ROW aggregate: Unknown properties: ${
          invalidProps.join(', ')
        }. Valid properties are: ${validProps.join(', ')}`,
    );
  }

  // Columns is required
  if (!('columns' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid JSON_ROW aggregate: Missing required property 'columns'`,
    );
  }

  if (obj.columns === null || obj.columns === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid JSON_ROW aggregate: columns cannot be null or undefined`,
    );
  }

  // Columns must be an object
  if (typeof obj.columns !== 'object' || Array.isArray(obj.columns)) {
    throw new TypeError(
      customMessage ??
        `Invalid JSON_ROW aggregate: columns must be a plain object (Record<string, ColumnIdentifier | Expression>)`,
    );
  }

  const columns = obj.columns as Record<string, unknown>;

  // Columns cannot be empty
  const keys = Object.keys(columns);
  if (keys.length === 0) {
    throw new TypeError(
      customMessage ??
        `Invalid JSON_ROW aggregate: columns cannot be empty. At least one column mapping is required`,
    );
  }

  // Validate each column mapping
  for (const [key, columnValue] of Object.entries(columns)) {
    if (columnValue === null || columnValue === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid JSON_ROW aggregate: columns['${key}'] cannot be null or undefined`,
      );
    }

    // If column is a string, validate it's a ColumnIdentifier
    if (typeof columnValue === 'string') {
      try {
        assertColumnIdentifier(columnValue);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid JSON_ROW aggregate: columns['${key}'] - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    } else if (typeof columnValue !== 'object') {
      throw new TypeError(
        customMessage ??
          `Invalid JSON_ROW aggregate: columns['${key}'] must be a string (ColumnIdentifier) or Expression object`,
      );
    } else {
      // Validate Expression structure
      try {
        assertExpression(columnValue);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid JSON_ROW aggregate: columns['${key}'] - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }
}
