import type { BaseOperators } from "./BaseOperators.ts";

export type DateOperators<ValueType extends Date | undefined> = BaseOperators<ValueType> & {
  $gt?: ValueType;
  $gte?: ValueType;
  $lt?: ValueType;
  $lte?: ValueType;
  $between?: {
    $from: ValueType;
    $to: ValueType;
  }
}