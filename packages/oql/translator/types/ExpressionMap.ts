import type { Expressions } from '../../types/mod.ts';
import type { ExpressionEmitter } from './ExpressionEmitter.ts';

/**
 * Map of expression-type → SQL emitter. A dialect declares one of
 * these as a class field; the abstract base looks the type up at
 * translation time.
 */
export type ExpressionMap = Map<
  Expressions['$$_expression'],
  ExpressionEmitter
>;
