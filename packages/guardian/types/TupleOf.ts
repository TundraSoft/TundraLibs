import type { BaseGuardian } from '../BaseGuardian.ts';
import type { FinishedGuardian } from './FinishedGuardian.ts';

/**
 * Map a tuple of `BaseGuardian<U>` into a tuple of `U`s — preserves
 * positions and inferred output types. Used by `TupleGuardian` to
 * surface `[number, number]` instead of `(number | number)[]`.
 */
export type TupleOf<T extends readonly FinishedGuardian<unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends BaseGuardian<infer U> ? U
    : T[K] extends FinishedGuardian<infer U> ? U
    : never;
};
