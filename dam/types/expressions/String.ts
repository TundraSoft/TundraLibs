import type { ColumnIdentifier } from '../ColumnIdentifier.ts';
import type { DateExpressions } from './Date.ts';

type Substr = {
  $expr: 'substr';
  $args: [string | ColumnIdentifier, number, number];
};

type Concat = {
  $expr: 'concat';
  $args: (string | ColumnIdentifier | StringExpressions)[];
};

type Replace = {
  $expr: 'replace';
  $args: [
    StringExpressions | string | ColumnIdentifier,
    StringExpressions | string | ColumnIdentifier,
    StringExpressions | string | ColumnIdentifier,
  ];
};

type Lower = {
  $expr: 'lower';
  $args: StringExpressions | string | ColumnIdentifier;
};

type Upper = {
  $expr: 'upper';
  $args: StringExpressions | string | ColumnIdentifier;
};

type Trim = {
  $expr: 'trim';
  $args: StringExpressions | string | ColumnIdentifier;
};

type DateFormat = {
  $expr: 'date_format';
  $args: [DateExpressions, string];
};

export type StringExpressions =
  | Substr
  | Concat
  | Replace
  | Lower
  | Upper
  | Trim
  | DateFormat;
