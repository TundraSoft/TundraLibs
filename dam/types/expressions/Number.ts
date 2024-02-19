import type { DateExpressions } from './Date.ts';
import type { StringExpressions } from './String.ts';
import type { UUIDExpressions } from './UUID.ts';
import type { ColumnIdentifier } from '../ColumnIdentifier.ts';

type Add = {
  $expr: 'add';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Sub = {
  $expr: 'subtract';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Mul = {
  $expr: 'multiply';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Div = {
  $expr: 'divide';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Mod = {
  $expr: 'modulo';
  $args: [
    NumberExpressions | ColumnIdentifier | number | bigint,
    NumberExpressions | ColumnIdentifier | number | bigint,
  ];
};

type Abs = {
  $expr: 'abs';
  $args: NumberExpressions | ColumnIdentifier | number | bigint;
};

type Ceil = {
  $expr: 'ceil';
  $args: NumberExpressions | ColumnIdentifier | number | bigint;
};

type Floor = {
  $expr: 'floor';
  $args: NumberExpressions | ColumnIdentifier | number | bigint;
};

type DateDiff = {
  $expr: 'date_diff';
  $args: [
    'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND',
    DateExpressions | ColumnIdentifier | Date,
    (DateExpressions | ColumnIdentifier | Date)?,
  ];
};

type Length = {
  $expr: 'length';
  $args:
    | StringExpressions
    | UUIDExpressions
    | NumberExpressions
    | ColumnIdentifier
    | string
    | number
    | bigint;
};

export type NumberExpressions =
  | Add
  | Sub
  | Mul
  | Div
  | Mod
  | Abs
  | Ceil
  | Floor
  | DateDiff
  | Length;
