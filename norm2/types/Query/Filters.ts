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

export type Filters<T> =
  | {
    [Property in keyof T]?: FilterOperators<T[Property]>;
  }
    & {
      $or?: Filters<T>;
      $and?: Filters<T>;
    }
  | Array<
    {
      [Property in keyof T]?: FilterOperators<T[Property]>;
    }
  >;
