export type FilterOperators<PropVal> = PropVal | {
  $eq?: PropVal;
  $neq?: PropVal;
  $in?: Array<PropVal>;
  $nin?: Array<PropVal>;
  $lt?: PropVal;
  $lte?: PropVal;
  $gt?: PropVal;
  $gte?: PropVal;
  $between?: {
    $from: PropVal;
    $to: PropVal;
  };
  $null?: boolean;
  $like?: PropVal;
  $nlike?: PropVal;
  $ilike?: PropVal;
  $nilike?: PropVal;
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

type TT = {
  a: string;
  b: number;
};
const a: QueryFilter<TT> = {};
a["a"] = "123";
