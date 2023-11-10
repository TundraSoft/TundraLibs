import type { ColumnType, ModelDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';

export type UpdateQuery<
  DM extends ModelDefinition = ModelDefinition,
  TN extends keyof DM = keyof DM,
> = BaseQuery<DM, TN> & {
  data: {
    [K in keyof DM[TN]['columns']]?: ColumnType<DM[TN]['columns'][K]['type']>;
  };
};
