type GlobalOperators<PropVal> = {
  $eq?: PropVal;
  $neq?: PropVal;
  $in?: Array<PropVal>;
  $nin?: Array<PropVal>;
  $null?: boolean;
};

type StringOperators<PropVal> = GlobalOperators<PropVal> & {
  $like?: string;
  $nlike?: string;
};

type NumberOperators<PropVal> = GlobalOperators<PropVal> & {
  $lt?: PropVal;
  $lte?: PropVal;
  $gt?: PropVal;
  $gte?: PropVal;
  $between?: {
    $from: PropVal;
    $to: PropVal;
  };
};

// export type FilterOperators<PropVal> = PropVal | {
//   $eq?: PropVal;
//   $neq?: PropVal;
//   $in?: Array<PropVal>;
//   $nin?: Array<PropVal>;
//   $lt?: PropVal;
//   $lte?: PropVal;
//   $gt?: PropVal;
//   $gte?: PropVal;
//   $between?: {
//     $from: PropVal;
//     $to: PropVal;
//   };
//   $null?: boolean;
//   $like?: string;
//   $nlike?: string;
// };

export type FilterOperators<PropVal> =
  | PropVal
  | PropVal extends number | Date ? NumberOperators<PropVal>
  : PropVal extends string ? StringOperators<PropVal>
  : GlobalOperators<PropVal>;
