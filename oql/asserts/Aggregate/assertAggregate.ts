import type { AggregateFunction } from '../../types/mod.ts';
import { assertCount } from './assertCount.ts';
import { assertNumericAggregate } from './assertNumericAggregate.ts';
import { assertStringAgg } from './assertStringAgg.ts';
import { assertArrayAgg } from './assertArrayAgg.ts';
import { assertJsonRow } from './assertJsonRow.ts';

/**
 * Asserts that a value is a valid Aggregate function object.
 *
 * This is the main entry point for validating any aggregate function.
 * It delegates to specific validators based on the aggregate type.
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid Aggregate
 *
 * @example
 * ```typescript
 * assertAggregate({ type: 'COUNT' });  // OK
 * assertAggregate({ type: 'SUM', column: '@amount' });  // OK
 * assertAggregate({ type: 'STRING_AGG', column: '@name', separator: ', ' });  // OK
 * assertAggregate({ type: 'INVALID' });  // Throws
 * assertAggregate({ column: '@amount' });  // Throws - missing type
 * ```
 */
export function assertAggregate(
  value: unknown,
  customMessage?: string,
): asserts value is { type: AggregateFunction } {
  // Check if value is an object
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ??
        `Invalid Aggregate: Expected an object, got ${typeof value}`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Check if type property exists
  if (!('type' in obj)) {
    throw new TypeError(
      customMessage ?? `Invalid Aggregate: Missing required property 'type'`,
    );
  }

  // Validate type is a string
  if (typeof obj.type !== 'string') {
    throw new TypeError(
      customMessage ??
        `Invalid Aggregate: Property 'type' must be a string, got ${typeof obj
          .type}`,
    );
  }

  const validTypes: AggregateFunction[] = [
    'COUNT',
    'SUM',
    'MIN',
    'MAX',
    'AVG',
    'STRING_AGG',
    'ARRAY_AGG',
    'JSON_ROW',
  ];

  if (!validTypes.includes(obj.type as AggregateFunction)) {
    throw new TypeError(
      customMessage ??
        `Invalid Aggregate: Unknown type '${obj.type}'. Valid types are: ${
          validTypes.join(', ')
        }`,
    );
  }

  // Delegate to specific validators based on type
  switch (obj.type) {
    case 'COUNT':
      assertCount(value, customMessage);
      break;
    case 'SUM':
    case 'MIN':
    case 'MAX':
    case 'AVG':
      assertNumericAggregate(value, customMessage);
      break;
    case 'STRING_AGG':
      assertStringAgg(value, customMessage);
      break;
    case 'ARRAY_AGG':
      assertArrayAgg(value, customMessage);
      break;
    case 'JSON_ROW':
      assertJsonRow(value, customMessage);
      break;
  }
}
