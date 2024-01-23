import type { ColumnIdentifier } from '../columns/mod.ts';
import type { DateExpressions } from './DateExpressions.ts';
import type { StringExpressions } from './StringExpressions.ts';

type NumericExpressionType =
  | number
  | bigint
  | ColumnIdentifier
  | NumericExpressions;

export type AddExpression = {
  add: NumericExpressionType[];
};
export type SubtractExpression = {
  sub: NumericExpressionType[];
};
export type MultiplyExpression = {
  mul: NumericExpressionType[];
};
export type DivideExpression = {
  div: [
    NumericExpressionType,
    NumericExpressionType,
  ];
};
export type ModuloExpression = {
  mod: [
    NumericExpressionType,
    NumericExpressionType,
  ];
};
export type AbsoluteExpression = {
  abs: NumericExpressionType;
};
export type CeilingExpression = {
  ceil: NumericExpressionType;
};
export type FloorExpression = {
  floor: NumericExpressionType;
};
export type RoundExpression = {
  round: NumericExpressionType;
};

export type AgeExpression = {
  age: ColumnIdentifier | Date | DateExpressions;
};

export type LengthExpression = {
  length: string | ColumnIdentifier | StringExpressions;
};

export type DatePartExpression = {
  datePart: {
    date: ColumnIdentifier | Date | DateExpressions;
    part: 'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND';
  };
};

export type NumericExpressions =
  | AddExpression
  | SubtractExpression
  | MultiplyExpression
  | DivideExpression
  | ModuloExpression
  | AbsoluteExpression
  | CeilingExpression
  | FloorExpression
  | RoundExpression
  | AgeExpression
  | DatePartExpression;
