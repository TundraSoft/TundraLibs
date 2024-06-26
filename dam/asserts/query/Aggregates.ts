import type { Aggregates, BaseAggregates } from '../../types/mod.ts';
import { assertDateExpression, assertNumberExpression } from './Expressions.ts';
import { assertColumnIdentifier } from './ColumnIdentifier.ts';

const aggregateNames = [
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COUNT',
  'DISTINCT',
  'JSON_ROW',
];

export const assertBaseAggregate = (x: unknown): x is BaseAggregates => {
  return (typeof x === 'object' && x !== null && '$aggr' in x &&
    typeof x.$aggr === 'string' && aggregateNames.includes(x.$aggr));
};

export const assertAggregates = (
  x: unknown,
  columns?: string[],
): x is Aggregates => {
  return assertBaseAggregate(x) &&
    ((['MIN', 'MAX'].includes(x.$aggr) &&
        assertColumnIdentifier(x.$args, columns) ||
      assertDateExpression(x.$args, columns) ||
      assertNumberExpression(x.$args, columns)) || // Number and Date expression for MIN and MAX
      (['SUM', 'AVG'].includes(x.$aggr) &&
        (assertColumnIdentifier(x.$args, columns) ||
          assertNumberExpression(x.$args, columns))) || // Only number expression for SUM and AVG
      x.$aggr === 'DISTINCT' && Array.isArray(x.$args) && x.$args.length > 0 &&
        x.$args.every((c) => assertColumnIdentifier(c, columns)) || // Handle DISTINCT
      x.$aggr === 'COUNT' && (
          x.$args === '*' || assertColumnIdentifier(x.$args, columns) ||
          (assertBaseAggregate(x.$args) && x.$args.$aggr === 'DISTINCT' &&
            assertAggregates(x.$args, columns)) // Handle COUNT with DISTINCT
        ) ||
      x.$aggr === 'JSON_ROW' && Array.isArray(x.$args) && x.$args.length > 0 &&
        x.$args.every((c) => assertColumnIdentifier(c, columns))); // Handle JSON_ROW;
};
