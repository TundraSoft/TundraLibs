import type { ColumnIdentifier } from './ColumnIdentifier.ts';
import type { NumberExpressions } from './expressions/mod.ts';
import { DateExpressions } from './mod.ts';

type SUM = {
  $aggr: 'SUM';
  $args: ColumnIdentifier | NumberExpressions;
};

type AVG = {
  $aggr: 'AVG';
  $args: ColumnIdentifier | NumberExpressions | DateExpressions;
};

type MIN = {
  $aggr: 'MIN';
  $args: ColumnIdentifier | NumberExpressions | DateExpressions;
};

type MAX = {
  $aggr: 'MAX';
  $args: ColumnIdentifier | NumberExpressions | DateExpressions;
};

type DISTINCT = {
  $aggr: 'DISTINCT';
  $args: [ColumnIdentifier];
};

type COUNT = {
  $aggr: 'COUNT';
  $args: ColumnIdentifier | '*' | DISTINCT;
};

type JSONRow = {
  $aggr: 'JSON_ROW';
  $args: ColumnIdentifier[];
};

export type BaseAggregates = {
  $aggr: string;
  $args?: unknown;
};

export type Aggregates = SUM | AVG | MIN | MAX | COUNT | DISTINCT | JSONRow;
