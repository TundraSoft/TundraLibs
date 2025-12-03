import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import { assertExpression } from '../Expression/mod.ts';

/**
 * Asserts that a value is a valid STRING_AGG aggregate.
 *
 * STRING_AGG requires:
 * - `type`: 'STRING_AGG'
 * - `column`: A ColumnIdentifier or Expression
 * - `separator`: Optional string (defaults to ',' in implementation)
 * - `distinct`: Optional boolean
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid STRING_AGG aggregate
 *
 * @example
 * ```typescript
 * assertStringAgg({ type: 'STRING_AGG', column: '@name' });  // OK
 * assertStringAgg({ type: 'STRING_AGG', column: '@email', separator: '; ' });  // OK
 * assertStringAgg({ type: 'STRING_AGG', column: '@tag', separator: ', ', distinct: true });  // OK
 * assertStringAgg({ type: 'STRING_AGG' });  // Throws - missing column
 * assertStringAgg({ type: 'STRING_AGG', column: '@name', separator: 123 });  // Throws - separator must be string
 * ```
 */
export function assertStringAgg(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'STRING_AGG';
  column: string | object;
  separator?: string;
  distinct?: boolean;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid STRING_AGG aggregate: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  if (obj.type !== 'STRING_AGG') {
    throw new TypeError(
      customMessage ??
        `Invalid STRING_AGG aggregate: type must be 'STRING_AGG'`,
    );
  }

  // Check for invalid properties
  const validProps = ['type', 'column', 'separator', 'distinct'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid STRING_AGG aggregate: Unknown properties: ${
          invalidProps.join(', ')
        }. Valid properties are: ${validProps.join(', ')}`,
    );
  }

  // Column is required
  if (!('column' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid STRING_AGG aggregate: Missing required property 'column'`,
    );
  }

  if (obj.column === null || obj.column === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid STRING_AGG aggregate: column cannot be null or undefined`,
    );
  }

  // If column is a string, validate it's a ColumnIdentifier
  if (typeof obj.column === 'string') {
    try {
      assertColumnIdentifier(obj.column);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid STRING_AGG aggregate: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  } else if (typeof obj.column !== 'object') {
    throw new TypeError(
      customMessage ??
        `Invalid STRING_AGG aggregate: column must be a string (ColumnIdentifier) or Expression object`,
    );
  } else {
    // Validate Expression structure
    try {
      assertExpression(obj.column);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid STRING_AGG aggregate: column - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate separator if present
  if ('separator' in obj) {
    if (typeof obj.separator !== 'string') {
      throw new TypeError(
        customMessage ??
          `Invalid STRING_AGG aggregate: separator must be a string`,
      );
    }
  }

  // Validate distinct if present
  if ('distinct' in obj && typeof obj.distinct !== 'boolean') {
    throw new TypeError(
      customMessage ??
        `Invalid STRING_AGG aggregate: distinct must be a boolean`,
    );
  }
}
