import type { DateExpressions } from './Date.ts';
import type { StringExpressions } from './String.ts';
import type { UUIDExpressions } from './UUID.ts';
import type { ColumnIdentifier } from '../ColumnIdentifier.ts';

type Add = {
  $expr: 'ADD';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Sub = {
  $expr: 'SUBTRACT';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Mul = {
  $expr: 'MULTIPLY';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Div = {
  $expr: 'DIVIDE';
  $args: (NumberExpressions | ColumnIdentifier | number | bigint)[];
};

type Mod = {
  $expr: 'MODULO';
  $args: [
    NumberExpressions | ColumnIdentifier | number | bigint,
    NumberExpressions | ColumnIdentifier | number | bigint,
  ];
};

type Abs = {
  $expr: 'ABS';
  $args: NumberExpressions | ColumnIdentifier | number | bigint;
};

type Ceil = {
  $expr: 'CEIL';
  $args: NumberExpressions | ColumnIdentifier | number | bigint;
};

type Floor = {
  $expr: 'FLOOR';
  $args: NumberExpressions | ColumnIdentifier | number | bigint;
};

type DateDiff = {
  $expr: 'DATE_DIFF';
  $args: [
    'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND',
    DateExpressions | ColumnIdentifier | Date,
    (DateExpressions | ColumnIdentifier | Date)?,
  ];
};

type Length = {
  $expr: 'LENGTH';
  $args:
    | StringExpressions
    | UUIDExpressions
    | NumberExpressions
    // | ColumnIdentifier // Removed as string will override this
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
