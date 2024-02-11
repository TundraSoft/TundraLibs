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

export type QueryFilters<
  R extends Record<string, unknown> = Record<string, unknown>,
> =
  & {
    [Property in keyof R]?: R[Property] extends string
      ? StringOperators<R[Property]>
      : R[Property] extends number | bigint ? NumberOperators<R[Property]>
      : R[Property] extends Date ? DateOperators<R[Property]>
      : R[Property] extends boolean ? BooleanOperators<R[Property]>
      : BaseOperators<R[Property]>;
  }
  & {
    $and: QueryFilters<R> | QueryFilters<R>[];
    $or: QueryFilters<R> | QueryFilters<R>[];
  };

export type BaseQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = {
  source: string[];
  columns: Record<string, string>;
};

export type DeleteQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  filters?: QueryFilters<M>;
};

export type InsertQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  values: Record<string, unknown> | Record<string, unknown>[];
};

type RelatedSelectQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = {
  relation: Record<string, string>;
} & SelectQuery<M>;

export type SelectQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  filters?: QueryFilters<M>;
  with?: Record<string, RelatedSelectQuery>;
};

export type UpdateQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  values: Record<string, unknown>;
  filters?: QueryFilters<M>;
};

class QueryTranslator {
  insert(insert: InsertQuery): [string, Record<string, unknown>] {}
}
