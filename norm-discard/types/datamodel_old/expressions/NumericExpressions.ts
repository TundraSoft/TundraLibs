export type AddExpression = {
  add: [number | bigint | string | NumericExpression];
};
export type SubtractExpression = {
  subtract: [number | bigint | string | NumericExpression];
};
export type MultiplyExpression = {
  multiply: [number | bigint | string | NumericExpression];
};
export type DivideExpression = {
  divide: [
    number | bigint | string | NumericExpression,
    number | bigint | string | NumericExpression,
  ];
};
export type ModuloExpression = {
  modulo: [
    number | bigint | string | NumericExpression,
    number | bigint | string | NumericExpression,
  ];
};
export type AbsoluteExpression = {
  absolute: number | bigint | string | NumericExpression;
};
export type CeilingExpression = {
  ceiling: number | bigint | string | NumericExpression;
};
export type FloorExpression = {
  floor: number | bigint | string | NumericExpression;
};
export type RoundExpression = {
  round: number | bigint | string | NumericExpression;
};

export type NumericExpression =
  | AddExpression
  | SubtractExpression
  | MultiplyExpression
  | DivideExpression
  | ModuloExpression
  | AbsoluteExpression
  | CeilingExpression
  | FloorExpression
  | RoundExpression;
