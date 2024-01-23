import type { ModelDefinition } from './Model.ts';
import type { ViewDefinition } from './View.ts';

export type SchemaDefinition = Record<string, ModelDefinition | ViewDefinition>;
