import type { TableDefinition } from '../Definitions/mod.ts';

// export type BaseQuery<DM extends ModelDefinition = ModelDefinition, TN extends keyof DM = keyof DM> = {
//   model: TN;
//   columns: (keyof DM[TN]['columns'])[];
// };

export type BaseQuery<TD extends TableDefinition = TableDefinition> = {
  model: string;
  columns: (keyof TD['columns'])[];
};
