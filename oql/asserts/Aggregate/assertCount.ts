import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import { assertExpression } from '../Expression/mod.ts';

/**
 * Asserts that a value is a valid COUNT aggregate.
 *
 * COUNT can be used in two forms:
 * 1. `{ type: 'COUNT' }` - COUNT(*) - counts all rows
 * 2. `{ type: 'COUNT', column: '@col', distinct?: boolean }` - counts column values
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid COUNT aggregate
 *
 * @example
 * ```typescript
 * assertCount({ type: 'COUNT' });  // OK - COUNT(*)
 * assertCount({ type: 'COUNT', column: '@id' });  // OK
 * assertCount({ type: 'COUNT', column: '@email', distinct: true });  // OK
 * assertCount({ type: 'COUNT', column: 'id' });  // Throws - invalid column identifier
 * assertCount({ type: 'COUNT', column: '@id', separator: ',' });  // Throws - invalid property
 * ```
 */
export function assertCount(
  value: unknown,
  customMessage?: string,
): asserts value is { type: 'COUNT'; column?: string; distinct?: boolean } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid COUNT aggregate: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  if (obj.type !== 'COUNT') {
    throw new TypeError(
      customMessage ?? `Invalid COUNT aggregate: type must be 'COUNT'`,
    );
  }

  // Check for invalid properties
  const validProps = ['type', 'column', 'distinct'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid COUNT aggregate: Unknown properties: ${
          invalidProps.join(', ')
        }. Valid properties are: ${validProps.join(', ')}`,
    );
  }

  // If column is provided, validate it
  if ('column' in obj) {
    if (obj.column === null || obj.column === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid COUNT aggregate: column cannot be null or undefined`,
      );
    }

    // If column is a string, validate it's a ColumnIdentifier
    if (typeof obj.column === 'string') {
      try {
        assertColumnIdentifier(obj.column);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid COUNT aggregate: ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    } else if (typeof obj.column !== 'object') {
      throw new TypeError(
        customMessage ??
          `Invalid COUNT aggregate: column must be a string (ColumnIdentifier) or Expression object`,
      );
    } else {
      // Validate Expression structure
      try {
        assertExpression(obj.column);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid COUNT aggregate: column - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }

    // If column is provided, distinct can be optionally present
    if ('distinct' in obj && typeof obj.distinct !== 'boolean') {
      throw new TypeError(
        customMessage ??
          `Invalid COUNT aggregate: distinct must be a boolean`,
      );
    }
  } else {
    // COUNT(*) form - should not have column or distinct
    if ('distinct' in obj) {
      throw new TypeError(
        customMessage ??
          `Invalid COUNT aggregate: COUNT(*) cannot have 'distinct' property`,
      );
    }
  }
}
