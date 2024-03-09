import type { ColumnIdentifier } from '../ColumnIdentifier.ts';

type JSONValue = {
  $expr: 'JSON_VALUE';
  $args: [ColumnIdentifier, string[]];
};

export type JSONExpressions = JSONValue;
