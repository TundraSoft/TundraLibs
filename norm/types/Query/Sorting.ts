import type { TableDefinition } from '../Definitions/mod.ts';

export type QuerySorting<TD extends TableDefinition = TableDefinition> = {
  orderBy?: [keyof TD['columns'], 'ASC' | 'DESC'][];
};