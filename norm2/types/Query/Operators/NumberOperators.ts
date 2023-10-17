import type { BaseOperators } from "./BaseOperators.ts";

export type NumberOperators<ValueType extends number | bigint | undefined> = BaseOperators<ValueType> & {
  $gt?: ValueType;
  $gte?: ValueType;
  $lt?: ValueType;
  $lte?: ValueType;
  $between?: {
    $from: ValueType;
    $to: ValueType;
  };
}