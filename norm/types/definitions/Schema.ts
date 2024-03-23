import type { TableDefinition } from './Table.ts';
import type { ViewDefinition } from './View.ts';

export type SchemaDefinition = Record<string, TableDefinition | ViewDefinition>;
