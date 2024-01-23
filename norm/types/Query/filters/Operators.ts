export type PropValType = string | number | bigint | boolean | Date | unknown;

export type BaseOperators<P extends PropValType> = PropValType | {
  $eq: P;
  $ne: P;
  $null: boolean;
  $in: P[];
  $nin: P[];
};

export type StringOperators<P extends PropValType = string> =
  & BaseOperators<P>
  & {
    $like: string;
    $nlike: string;
    $contains: string;
    $ncontains: string;
    $startsWith: string;
    $nstartsWith: string;
    $endsWith: string;
    $nendsWith: string;
  };

export type NumberOperators<P extends PropValType = number | bigint> =
  & BaseOperators<P>
  & {
    $gt: P;
    $gte: P;
    $lt: P;
    $lte: P;
  };
export type DateOperators<P extends PropValType = Date> = NumberOperators<P>;

export type BooleanOperators<P extends PropValType = boolean> = BaseOperators<
  P
>;
