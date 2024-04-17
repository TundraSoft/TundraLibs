import type { ColumnIdentifier } from '../ColumnIdentifier.ts';

export type JSONExpressions = {
  $expr: 'JSON_VALUE';
  $args: [ColumnIdentifier, string[]];
};
