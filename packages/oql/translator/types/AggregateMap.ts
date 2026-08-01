import type { AggregateFunction } from '../../types/mod.ts';
import type { AggregateEmitter } from './AggregateEmitter.ts';

/** Map of aggregate-name → SQL emitter. */
export type AggregateMap = Map<AggregateFunction, AggregateEmitter>;
