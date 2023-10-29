import { ColumnDefinition } from './ColumnDefinition.ts';

export type TableDefinition = {
  name: string;
  schema?: string;
  columns: {
    [name: string]: ColumnDefinition;
  };
  primaryKeys?: readonly string[];
  uniqueKeys?: {
    [name: string]: readonly string[];
  };
  relations?: {
    [name: string]: {
      model: string;
      hasMany: boolean;
      relationship: {
        [name: string]: string;
      };
    };
  };
  distrbutionKey?: string;
  partition?: {
    type: 'range' | 'list';
    key: string;
    range: {
      start: number;
      end: number;
    };
    list: Array<number>;
  };
};
