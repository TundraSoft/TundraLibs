import type { TableDefinition } from './TableDefinition.ts';

export type Schema = {
  [name: string]: TableDefinition;
};
