import { TableDefinition } from './Table.ts';
import { DeepWritable } from '../mod.ts';

export type ModelDefinition = Record<string, TableDefinition>;
