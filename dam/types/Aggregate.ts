import { ColumnIdentifier, Expressions } from './mod.ts';

type Sum = {
  $aggr: 'SUM';
  $args: ColumnIdentifier | Expressions;
};

type Min = {
  $aggr: 'MIN';
  $args: ColumnIdentifier | Expressions;
};

type Max = {
  $aggr: 'MAX';
  $args: ColumnIdentifier | Expressions;
};

type Avg = {
  $aggr: 'AVG';
  $args: ColumnIdentifier | Expressions;
};

type Count = {
  $aggr: 'COUNT';
  $args: ColumnIdentifier | '*';
};

type Distinct = {
  $aggr: 'DISTINCT';
  $args: [ColumnIdentifier];
};

type JSONRow = {
  $aggr: 'JSON_ROW';
  $args: Record<string, ColumnIdentifier | Expressions | Aggregate>;
};

export type Aggregate = Sum | Min | Max | Avg | Count | Distinct | JSONRow;
