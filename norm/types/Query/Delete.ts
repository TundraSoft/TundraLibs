import type { TableDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';
import type { QueryFilters } from './Filters.ts';

// export type DeleteQuery<DM extends ModelDefinition = ModelDefinition, TN extends keyof DM = keyof DM> = BaseQuery<DM, TN> & {
//   where: QueryFilters<DM[TN]>;
// };

export type DeleteQuery<TD extends TableDefinition = TableDefinition> =
  & BaseQuery<TD>
  & {
    where: QueryFilters<TD>;
  };
