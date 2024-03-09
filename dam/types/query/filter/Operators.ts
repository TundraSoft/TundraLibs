type PropVal = string | number | bigint | boolean | Date | unknown;

export type BaseFilter<P extends PropVal> = P | [P] | null | undefined | {
  $eq?: P;
  $ne?: P;
  $null?: boolean;
  $in?: P[];
  $nin?: P[];
};

export type StringFilter<P extends string = string> = BaseFilter<P> & {
  $like?: P;
  $ilike?: P;
  $nlike?: P;
  $nilike?: P;
  $contains?: P;
  $ncontains?: P;
  $startsWith?: P;
  $nstartsWith?: P;
  $endsWith?: P;
  $nendsWith?: P;
};

type ComparisonFilters<P extends number | bigint | Date = number> =
  & BaseFilter<P>
  & {
    $gt?: P;
    $gte?: P;
    $lt?: P;
    $lte?: P;
    $between: [P, P];
  };

export type NumberFilter<P extends number = number> = ComparisonFilters<P>;

export type BigIntFilter<P extends bigint = bigint> = ComparisonFilters<P>;

export type BooleanFilter = BaseFilter<boolean>;

export type DateFilter<P extends Date = Date> = ComparisonFilters<P>;

export type Filters<P extends PropVal = PropVal> = P extends string
  ? StringFilter
  : P extends number ? NumberFilter
  : P extends bigint ? BigIntFilter
  : P extends boolean ? BooleanFilter
  : P extends Date ? DateFilter
  : BaseFilter<P>;

export type Operators =
  | '$eq'
  | '$ne'
  | '$null'
  | '$in'
  | '$nin'
  | '$like'
  | '$ilike'
  | '$nlike'
  | '$nilike'
  | '$contains'
  | '$ncontains'
  | '$startsWith'
  | '$nstartsWith'
  | '$endsWith'
  | '$nendsWith'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$between';
