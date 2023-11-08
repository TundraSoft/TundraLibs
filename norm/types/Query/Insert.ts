import type { ColumnType, TableDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';

// export type InsertQuery<DM extends ModelDefinition = ModelDefinition, TN extends keyof DM = keyof DM> = BaseQuery<DM, TN> & {
//   data: {
//     [K in keyof DM[TN]['columns']]?: ColumnType<DM[TN]['columns'][K]['type']>;
//   }[];
// };

export type InsertQuery<TD extends TableDefinition = TableDefinition> = BaseQuery<TD> & {
  data: {
    [K in keyof TD['columns']]?: ColumnType<TD['columns'][K]['type']>;
  }[];
}