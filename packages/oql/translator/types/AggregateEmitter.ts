/**
 * SQL emitter for a single aggregate. Same contract as
 * `ExpressionEmitter` — argument SQL strings come pre-translated;
 * the emitter glues the function call together.
 */
export type AggregateEmitter = (args: string[]) => string;
