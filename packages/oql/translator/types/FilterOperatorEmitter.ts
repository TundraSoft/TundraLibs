/**
 * SQL emitter for a single filter operator (`$eq`, `$gt`, `$like`,
 * …). Receives the already-translated column SQL on the left and
 * the already-parameterised value SQL on the right.
 */
export type FilterOperatorEmitter = (column: string, value: string) => string;
