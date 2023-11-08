import type { ColumnDefinition } from './Column.ts';
import type { RelationshipDefinition } from './Relationship.ts';

export type TableDefinition = {
  name: string;
  schema?: string;
  connection?: string;
  comments?: string;
  columns: {
    [key: string]: ColumnDefinition;
  };
  primaryKeys?: string[];
  uniqueKeys?: {
    [key: string]: string[];
  };
  relationShips?: {
    [key: string]: RelationshipDefinition;
  };
  partition?: string[];
  distribute?: string;

  limit?: number;
}

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export type TablePrimaryKey<T extends TableDefinition> = T extends { primaryKeys: string[] } ? Extract<
  keyof T['columns'],
  T['primaryKeys'][number]
> : never;

const a = {
  name: 'a',
  columns: {
    id: {
      name: 'id',
      type: 'INTEGER',
    },
    name: {
      name: 'name',
      type: 'VARCHAR',
    },
  },
  primaryKeys: ['id'],
  relationShips: {},
} as const;

type aa = DeepWriteable<typeof a>;
