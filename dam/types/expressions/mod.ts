import type { DateExpressions } from './Date.ts';
import type { NumberExpressions } from './Number.ts';
import type { StringExpressions } from './String.ts';
import type { UUIDExpressions } from './UUID.ts';

export type Expressions =
  | DateExpressions
  | NumberExpressions
  | StringExpressions
  | UUIDExpressions;

export type {
  DateExpressions,
  NumberExpressions,
  StringExpressions,
  UUIDExpressions,
};

export type ExpressionsType<E extends Expressions> = E extends
  StringExpressions | UUIDExpressions ? string
  : E extends NumberExpressions ? number | bigint
  : E extends DateExpressions ? Date
  : never;

export type DefineExpression<
  T extends string | number | bigint | Date | boolean | unknown,
> = T extends string ? StringExpressions | UUIDExpressions
  : T extends number | bigint ? NumberExpressions
  : T extends Date ? DateExpressions
  : Expressions;

type ArgumentTypes<T> = T extends (...args: infer U) => infer _ ? U : never;

// Used to define functions in dialects
export type QueryExpressions = {
  [K in Expressions['$expr']]:
    Extract<Expressions, { $expr: K; $args: unknown }> extends
      { $args: infer A }[] ? () => string
      : (
        ...args: [Extract<Expressions, { $expr: K; $args: unknown }>['$args']]
      ) => string;
};
