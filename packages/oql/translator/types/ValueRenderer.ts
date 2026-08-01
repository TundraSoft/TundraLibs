import type { Parameters } from '../Parameters.ts';

/**
 * Helper signature passed to internal walk methods so subclass
 * overrides can call back into the shared parameteriser without
 * re-implementing it.
 *
 * @internal
 */
export type ValueRenderer = (value: unknown, params: Parameters) => string;
