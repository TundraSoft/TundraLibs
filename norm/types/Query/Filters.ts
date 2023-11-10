import type { ColumnType, TableDefinition } from '../Definitions/mod.ts';

type FilterOperators<CT> = CT | {
  $eq?: CT;
  $ne?: CT;
  $gt?: CT;
  $gte?: CT;
  $lt?: CT;
  $lte?: CT;
  $in?: CT[];
  $nin?: CT[];
  $regex?: RegExp;
};

export type QueryFilters<TD extends TableDefinition = TableDefinition> =
  & {
    [C in keyof TD['columns']]?: FilterOperators<
      ColumnType<TD['columns'][C]['type']>
    >;
  }
  & {
    $and?: QueryFilters<TD>[];
    $or?: QueryFilters<TD>[];
  };
