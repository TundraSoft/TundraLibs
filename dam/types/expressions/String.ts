import type { ColumnIdentifier } from '../ColumnIdentifier.ts';
import type { DateExpressions } from './Date.ts';

type Substr = {
  $expr: 'SUBSTR';
  $args: [string | ColumnIdentifier, number, number];
};

type Concat = {
  $expr: 'CONCAT';
  $args: (string | ColumnIdentifier | StringExpressions)[];
};

type Replace = {
  $expr: 'REPLACE';
  $args: [
    StringExpressions | string | ColumnIdentifier,
    StringExpressions | string | ColumnIdentifier,
    StringExpressions | string | ColumnIdentifier,
  ];
};

type Lower = {
  $expr: 'LOWER';
  $args: StringExpressions | string | ColumnIdentifier;
};

type Upper = {
  $expr: 'UPPER';
  $args: StringExpressions | string | ColumnIdentifier;
};

type Trim = {
  $expr: 'TRIM';
  $args: StringExpressions | string | ColumnIdentifier;
};

type DateFormat = {
  $expr: 'DATE_FORMAT';
  $args: [DateExpressions | ColumnIdentifier, string];
};

export type StringExpressions =
  | Substr
  | Concat
  | Replace
  | Lower
  | Upper
  | Trim
  | DateFormat;
