export type BaseOperators<
  ValueType extends string | number | bigint | boolean | Date | undefined,
> = ValueType | {
  $eq?: ValueType;
  $ne?: ValueType;
  $in?: ValueType[];
  $nin?: ValueType[];
  $null?: boolean;
};
