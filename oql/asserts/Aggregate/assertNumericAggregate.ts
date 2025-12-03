import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import { assertExpression } from '../Expression/mod.ts';
import type { AggregateFunction } from '../../types/mod.ts';

/**
 * Asserts that a value is a valid numeric aggregate (SUM, MIN, MAX, AVG).
 *
 * Numeric aggregates require:
 * - `type`: One of 'SUM', 'MIN', 'MAX', 'AVG'
 * - `column`: A ColumnIdentifier or Expression
 * - `distinct`: Optional boolean
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid numeric aggregate
 *
 * @example
 * ```typescript
 * assertNumericAggregate({ type: 'SUM', column: '@amount' });  // OK
 * assertNumericAggregate({ type: 'AVG', column: '@price', distinct: true });  // OK
 * assertNumericAggregate({ type: 'MIN', column: '@createdAt' });  // OK
 * assertNumericAggregate({ type: 'SUM' });  // Throws - missing column
 * assertNumericAggregate({ type: 'SUM', column: 'amount' });  // Throws - invalid column identifier
 * ```
 */
export function assertNumericAggregate(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'SUM' | 'MIN' | 'MAX' | 'AVG';
  column: string | object;
  distinct?: boolean;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid numeric aggregate: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  const validTypes: AggregateFunction[] = ['SUM', 'MIN', 'MAX', 'AVG'];
  if (!validTypes.includes(obj.type as AggregateFunction)) {
    throw new TypeError(
      customMessage ??
        `Invalid numeric aggregate: type must be one of ${
          validTypes.join(', ')
        }`,
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
        `Invalid ${obj.type} aggregate: Unknown properties: ${
          invalidProps.join(', ')
        }. Valid properties are: ${validProps.join(', ')}`,
    );
  }

  // Column is required
  if (!('column' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} aggregate: Missing required property 'column'`,
    );
  }

  if (obj.column === null || obj.column === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} aggregate: column cannot be null or undefined`,
    );
  }

  // If column is a string, validate it's a ColumnIdentifier
  if (typeof obj.column === 'string') {
    try {
      assertColumnIdentifier(obj.column);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} aggregate: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  } else if (typeof obj.column !== 'object') {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} aggregate: column must be a string (ColumnIdentifier) or Expression object`,
    );
  } else {
    // Validate Expression structure
    try {
      assertExpression(obj.column);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} aggregate: column - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate distinct if present
  if ('distinct' in obj && typeof obj.distinct !== 'boolean') {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} aggregate: distinct must be a boolean`,
    );
  }
}
