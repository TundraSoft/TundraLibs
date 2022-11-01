export type FilterOperators<T> = T | {
  $eq?: T;
  $neq?: T;
  $in?: Array<T>;
  $nin?: Array<T>;
  $lt?: T;
  $lte?: T;
  $gt?: T;
  $gte?: T;
  $between?: {
    $from: T;
    $to: T;
  };
  $null?: boolean;
  $like?: T;
  $nlike?: T;
  $ilike?: T;
  $nilike?: T;
};

export type QueryFilter<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  | {
    [Property in keyof T]?: FilterOperators<T[Property]>;
  }
    & {
      $or?: QueryFilter<T>;
      $and?: QueryFilter<T>;
    }
  | Array<
    {
      [Property in keyof T]?: FilterOperators<T[Property]>;
    }
  >;
