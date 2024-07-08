import type { NumberExpressions } from './Number.ts';

type UUIDExpression = {
  $expr: 'UUID';
};

type Substr = {
  $expr: 'SUBSTR';
  $args: [
    string | StringExpressions,
    number | NumberExpressions,
    number | NumberExpressions,
  ];
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

type Encrypt = {
  $expr: 'ENCRYPT';
  $args: [string, string];
};

type Decrypt = {
  $expr: 'DECRYPT';
  $args: [string, string];
};

type Hash = {
  $expr: 'HASH';
  $args: [string];
};

export type StringExpressions =
  | UUIDExpression
  | Substr
  | Concat
  | Replace
  | Lower
  | Upper
  | Trim;
