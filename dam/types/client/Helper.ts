import { DataTypes } from '../datatypes/mod.ts';

export type ClientHelper = {
  quoteColumns: (...column: [string, string?]) => string;
  // makeAlias: (name: string, alias?: string) => string;
  makeAlias: (...name: [string, string?, string?]) => string;
  jsonValue: (column: [string, string?], path: string[]) => string;
  rowAsColumn: (
    alias: string,
    columns: Record<string, string | boolean>,
  ) => string;
  makeColumnDefinition: (
    name: string,
    type: DataTypes,
    nullable?: boolean,
    length?: number | { precision: number; scale: number },
  ) => string;
};
