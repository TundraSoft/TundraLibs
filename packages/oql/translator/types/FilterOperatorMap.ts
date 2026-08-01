import type { FilterOperatorEmitter } from './FilterOperatorEmitter.ts';

/**
 * Map of filter-operator-name → SQL emitter. Operator keys carry
 * the `$` prefix from the AST (`$eq`, `$gt`, …).
 */
export type FilterOperatorMap = Map<string, FilterOperatorEmitter>;
