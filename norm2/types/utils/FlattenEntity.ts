import type { Unarray } from './Unarray.ts';
import type { UnionToIntersection } from './UnionToIntersection.ts';

type KeyCombiner<Parent extends string = '', K extends string = ''> =
  `${Parent}${Parent extends '' ? '' : '.'}${K}`;

export type FlattenEntity<
  T extends Record<string, unknown> = Record<string, unknown>,
  Parent extends string = '',
> = UnionToIntersection<
  {
    [K in keyof T]: T[K] extends Array<Record<string, unknown>>
      ? FlattenEntity<Unarray<T[K]>, KeyCombiner<Parent, K & string>>
      : T[K] extends Record<string, unknown>
        ? FlattenEntity<T[K], KeyCombiner<Parent, K & string>>
      : { [KK in KeyCombiner<Parent, K & string>]: Unarray<T[K]> };
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
>;

type a = FlattenEntity<
  {
    id: number[];
    name: string[];
    address: {
      city: string;
      street: string;
      zipCode: string;
      geo: { lat: number; long: number; radius?: number }[];
    };
  }
>;

type NumberOnly<
  T extends Record<string, unknown> = Record<string, unknown>,
  Y = FlattenEntity<T>,
> = {
  [K in keyof Y]: Y[K] extends number ? Y[K] : never;
} extends infer O ? { [P in keyof O]: O[P] } : never;

type b = NumberOnly<
  {
    id: number[];
    name: string[];
    address: {
      city: string;
      street: string;
      zipCode: string;
      geo: { lat: number; long: number; radius?: number }[];
    };
  }
>;
