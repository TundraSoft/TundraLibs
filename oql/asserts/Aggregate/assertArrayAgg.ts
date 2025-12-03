import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import { assertExpression } from '../Expression/mod.ts';

/**
 * Asserts that a value is a valid ARRAY_AGG aggregate.
 *
 * ARRAY_AGG requires:
 * - `type`: 'ARRAY_AGG'
 * - `column`: A ColumnIdentifier or Expression
 * - `distinct`: Optional boolean
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid ARRAY_AGG aggregate
 *
 * @example
 * ```typescript
 * assertArrayAgg({ type: 'ARRAY_AGG', column: '@id' });  // OK
 * assertArrayAgg({ type: 'ARRAY_AGG', column: '@tag', distinct: true });  // OK
 * assertArrayAgg({ type: 'ARRAY_AGG' });  // Throws - missing column
 * assertArrayAgg({ type: 'ARRAY_AGG', column: 'id' });  // Throws - invalid column identifier
 * ```
 */
export function assertArrayAgg(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'ARRAY_AGG';
  column: string | object;
  distinct?: boolean;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid ARRAY_AGG aggregate: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  if (obj.type !== 'ARRAY_AGG') {
    throw new TypeError(
      customMessage ?? `Invalid ARRAY_AGG aggregate: type must be 'ARRAY_AGG'`,
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
        `Invalid ARRAY_AGG aggregate: Unknown properties: ${
          invalidProps.join(', ')
        }. Valid properties are: ${validProps.join(', ')}`,
    );
  }

  // Column is required
  if (!('column' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid ARRAY_AGG aggregate: Missing required property 'column'`,
    );
  }

  if (obj.column === null || obj.column === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid ARRAY_AGG aggregate: column cannot be null or undefined`,
    );
  }

  // If column is a string, validate it's a ColumnIdentifier
  if (typeof obj.column === 'string') {
    try {
      assertColumnIdentifier(obj.column);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid ARRAY_AGG aggregate: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  } else if (typeof obj.column !== 'object') {
    throw new TypeError(
      customMessage ??
        `Invalid ARRAY_AGG aggregate: column must be a string (ColumnIdentifier) or Expression object`,
    );
  } else {
    // Validate Expression structure
    try {
      assertExpression(obj.column);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid ARRAY_AGG aggregate: column - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate distinct if present
  if ('distinct' in obj && typeof obj.distinct !== 'boolean') {
    throw new TypeError(
      customMessage ??
        `Invalid ARRAY_AGG aggregate: distinct must be a boolean`,
    );
  }
}
