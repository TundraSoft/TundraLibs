import type { DateExpressions } from './Date.ts';
import type { JSONExpressions } from './JSON.ts';
import type { NumberExpressions } from './Number.ts';
import type { StringExpressions } from './String.ts';

export type BaseExpression = {
  $expr: string;
  $args?: unknown;
};

export type Expressions =
  | StringExpressions
  | NumberExpressions
  | DateExpressions
  | JSONExpressions;

export type TypedExpressions<P> = P extends string ? StringExpressions
  : P extends number | bigint ? NumberExpressions
  : P extends Date ? DateExpressions
  : P extends Record<string, unknown> ? JSONExpressions
  : never;

export type {
  DateExpressions,
  JSONExpressions,
  NumberExpressions,
  StringExpressions,
};

type InferArgs<T> = T extends { $args: infer U } ? U : never;

type ExpressionArgs = {
  [K in Expressions['$expr']]: InferArgs<Extract<Expressions, { $expr: K }>>;
};

export type ExpressionFunction = {
  [K in keyof ExpressionArgs]: (
    ...args: ExpressionArgs[K] extends Array<unknown> ? ExpressionArgs[K]
      : ExpressionArgs[K][]
  ) =>
    | string
    | (ExpressionArgs[K] extends DateExpressions ? Date
      : ExpressionArgs[K] extends JSONExpressions ? Record<string, unknown>
      : ExpressionArgs[K] extends NumberExpressions ? number | bigint
      : string);
};
