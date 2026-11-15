import type { Expressions } from '../../types/mod.ts';

/**
 * SQL emitter for a single expression. Receives the already-
 * translated argument SQL strings (in declaration order) and
 * produces the dialect's SQL fragment for that expression.
 *
 * The shared `AbstractTranslator` translates each `args` entry
 * first, then hands the resulting strings to the emitter. Emitters
 * build their SQL from those strings, which keeps the per-dialect maps
 * small and failure modes obvious. The node itself comes second, for the
 * dialect whose SQL depends on what an operand is: Postgres has no `%`
 * for a double, so its `MODULO` must know when one is a `DATE_DIFF`.
 */
export type ExpressionEmitter = (args: string[], expr: Expressions) => string;
