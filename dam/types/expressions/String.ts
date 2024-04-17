import type { DateExpressions } from './Date.ts';

type Substr = {
  $expr: 'SUBSTR';
  $args: [string, number, number];
};

type Concat = {
  $expr: 'CONCAT';
  $args: (string | StringExpressions)[];
};

type Replace = {
  $expr: 'REPLACE';
  $args: [
    StringExpressions | string,
    StringExpressions | string,
    StringExpressions | string,
  ];
};

type Lower = {
  $expr: 'LOWER';
  $args: StringExpressions | string;
};

type Upper = {
  $expr: 'UPPER';
  $args: StringExpressions | string;
};

type Trim = {
  $expr: 'TRIM';
  $args: StringExpressions | string;
};

type DateFormat = {
  $expr: 'DATE_FORMAT';
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
