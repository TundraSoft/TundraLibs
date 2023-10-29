import { ColumnValidations } from './ColumnValidations.ts';
import type { DataType } from '../../const/mod.ts';

export type ColumnDefinition = {
  name: string;
  type: DataType;
  defaults?: {
    insert?: string;
    update?: string;
  };
  nullable?: boolean;
  validations?: ColumnValidations;
};
