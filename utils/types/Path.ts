import { UnionToIntersection } from './UnionToIntersection.ts';

export type Paths<
  T extends Record<string, unknown>,
  KeyPrefix extends string = '',
> = UnionToIntersection<
  {
    [K in keyof T]: T[K] extends Record<string, unknown> ?
        & Paths<
          T[K],
          KeyPrefix extends '' ? `${K & string}` : `${KeyPrefix}.${K & string}`
        >
        & {
          [KK in KeyPrefix extends '' ? K : `${KeyPrefix}.${K & string}`]: T[K];
        }
      : {
        [KK in KeyPrefix extends '' ? K : `${KeyPrefix}.${K & string}`]: T[K];
      };
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
> extends infer O ? { [P in keyof O]: O[P] } : never;

/**
 * Utility type that resolves the type of a value at a specific path in an object.
 * Handles nested properties using dot notation (e.g., 'logger.format.name').
 *
 * @template T - The object type to get a value from
 * @template P - The string path to the desired property
 */
export type PathValue<T, P extends string> = P extends keyof T ? T[P]
  : P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? T[K] extends Record<string, unknown> ? PathValue<T[K], Rest>
      : bigint
    : Array<boolean>
  : Array<string>;
