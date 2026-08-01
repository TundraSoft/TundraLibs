/**
 * SQL emitter for a single expression. Receives the already-
 * translated argument SQL strings (in declaration order) and
 * produces the dialect's SQL fragment for that expression.
 *
 * The shared `AbstractTranslator` translates each `args` entry
 * first, then hands the resulting strings to the emitter. Emitters
 * never see raw AST nodes — that's deliberate; it's what makes the
 * per-dialect maps small and failure modes obvious.
 */
export type ExpressionEmitter = (args: string[]) => string;
