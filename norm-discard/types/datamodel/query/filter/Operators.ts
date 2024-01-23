import type { ColumnIdentifier } from '../../columns/mod.ts';
import { SchemaDefinition } from '../../model/mod.ts';
import type { ExtractColumnType } from '../../columns/mod.ts';

type OperatorTypes = string | number | bigint | Date | boolean;

export type BaseOperators<
  T extends OperatorTypes,
  LOV extends Array<T> | undefined = undefined,
> = {
  $eq?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $neq?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $in?: LOV extends Array<infer U> ? U[] : T[];
  $nIn?: LOV extends Array<infer U> ? U[] : T[];
  $null?: boolean;
} extends infer O ? { [P in keyof O]?: O[P] } : never;

export type StringOperators<
  T extends string = string,
  LOV extends Array<T> | undefined = undefined,
> = BaseOperators<T, LOV> & {
  $regexp?: RegExp;
  $like?: T;
  $nLike?: T;
  $iLike?: T;
  $nILike?: T;
  $startsWith?: T;
  $nStartsWith?: T;
  $endsWith?: T;
  $nEndsWith?: T;
  $contains?: T;
  $nContains?: T;
} extends infer O ? { [P in keyof O]?: O[P] } : never;

export type NumberOperators<
  T extends number | bigint =
    | number
    | bigint,
  LOV extends Array<T> | undefined = undefined,
> = BaseOperators<T, LOV> & {
  $gt?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $gte?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $lt?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $lte?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $between?: LOV extends Array<infer U> ? [U, U]
    : [T | ColumnIdentifier, T | ColumnIdentifier];
  $nBetween?: LOV extends Array<infer U> ? [U, U]
    : [T | ColumnIdentifier, T | ColumnIdentifier];
} extends infer O ? { [P in keyof O]?: O[P] } : never;

export type DateOperators<
  T extends Date | `${string}` = Date | `${string}`,
  LOV extends Array<T> | undefined = undefined,
> = BaseOperators<T, LOV> & {
  $gt?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $gte?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $lt?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $lte?: LOV extends Array<infer U> ? U : T | ColumnIdentifier;
  $between?: LOV extends Array<infer U> ? [U, U]
    : [T | ColumnIdentifier, T | ColumnIdentifier];
  $nBetween?: LOV extends Array<infer U> ? [U, U]
    : [T | ColumnIdentifier, T | ColumnIdentifier];
} extends infer O ? { [P in keyof O]?: O[P] } : never;

export type BooleanOperators<
  T extends boolean = boolean,
> = BaseOperators<T, Array<T>> extends infer O ? { [P in keyof O]?: O[P] }
  : never;

export type QueryOperators<T extends OperatorTypes> =
  | T
  | T extends string ? StringOperators<T>
  : T extends number | bigint ? NumberOperators<T>
  : T extends Date ? DateOperators<T>
  : T extends boolean ? BooleanOperators<T>
  : never;

export type QueryFilters<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]?: QueryOperators<
    ExtractColumnType<S[MN]['columns'][C]>
  >;
};
