export type { IndexDefinition } from './Index.ts';
export type { RelationDefinition } from './Relation.ts';
import type { TableDefinition } from './Table.ts';

export type { TableDefinition };

export type SchemaDefinition = Record<string, TableDefinition>;
