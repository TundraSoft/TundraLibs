import type { UnionToIntersection } from './UnionToIntersection.ts';

/**
 * Recursively flattens an JSON object. The keys are concatenated using a dot separator.
 *
 * @template T - The entity type to flatten.
 * @template KeyPrefix - The prefix to prepend to each key.
 * @param {T} entity - The entity to flatten.
 * @returns {Flatten<T, KeyPrefix>} - The flattened entity.
 */
export type Flatten<
  T extends Record<string, unknown>,
  KeyPrefix extends string = '',
> = UnionToIntersection<
  {
    [K in keyof T]: T[K] extends Record<string, unknown> ? Flatten<
        T[K],
        KeyPrefix extends '' ? `${K & string}` : `${KeyPrefix}.${K & string}`
      >
      : {
        [KK in KeyPrefix extends '' ? K : `$${KeyPrefix}.${K & string}`]: T[K];
      };
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
> extends infer O ? { [P in keyof O]: O[P] } : never;
