import type { Flatten } from '../../../utils/mod.ts';
import type { TypedExpressions } from './expressions/mod.ts';

export type BaseOperators<P> = P | [P] | null | {
  $eq?: P | TypedExpressions<P>;
  $ne?: P | TypedExpressions<P>;
  $null?: boolean;
  $in?: Array<P | TypedExpressions<P>>;
  $nin?: Array<P | TypedExpressions<P>>;
};

export type StringOperators = BaseOperators<string> & {
  $like?: string;
  $ilike?: string;
  $nlike?: string;
  $nilike?: string;
  $contains?: string;
  $ncontains?: string;
  $startsWith?: string;
  $nstartsWith?: string;
  $endsWith?: string;
  $nendsWith?: string;
};

export type MathOperators<P extends number | bigint | Date> =
  & BaseOperators<P>
  & {
    $gt?: P | TypedExpressions<P>;
    $gte?: P | TypedExpressions<P>;
    $lt?: P | TypedExpressions<P>;
    $lte?: P | TypedExpressions<P>;
    $between?: [P | TypedExpressions<P>, P | TypedExpressions<P>];
  };

export type Operators<P> = P extends string ? StringOperators
  : P extends number | bigint | Date ? MathOperators<P>
  : P extends boolean ? BaseOperators<boolean>
  : never; // Last never is to ignore Array and JSON

export type QueryFilters<
  R extends Record<string, unknown> = Record<string, unknown>,
  FE extends Flatten<R> = Flatten<Required<R>>,
> =
  & {
    [Property in keyof FE]?: Operators<FE[Property]>;
  }
  & {
    $or?: QueryFilters<FE>[];
    $and?: QueryFilters<FE>[];
  } extends infer O ? { [P in keyof O]: O[P] } : never;
