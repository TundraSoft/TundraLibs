import type { ModelDefinition, TableDefinition } from '../Definitions/mod.ts';

export type BaseQuery<
  DM extends ModelDefinition = ModelDefinition,
  TN extends keyof DM = keyof DM,
> = {
  name: TN;
  schema?: TableDefinition['schema'];
  // columns: (keyof DM[TN]['columns'])[];
  columns: {
    [CA in keyof DM[TN]['columns']]: DM[TN]['columns'][CA]['name'];
  };
  project?: (keyof DM[TN]['columns'])[]; //& (keyof DM[TN]['columns'])[];
};
