import type {
  BigintTypes,
  BooleanTypes,
  DateTypes,
  DecimalTypes,
  IntegerTypes,
  StringTypes,
} from '../../dam/mod.ts';

export type JSONStructure =
  | {
    [key: string]:
      | JSONStructure
      | JSONStructure[]
      | (
        | StringTypes
        | StringTypes[]
        | BooleanTypes
        | BooleanTypes[]
        | IntegerTypes
        | IntegerTypes[]
        | DecimalTypes
        | DecimalTypes[]
        | BigintTypes
        | BigintTypes[]
        | DateTypes
        | DateTypes[]
      );
  }
  | JSONStructure[];

export type ExtractJSONStructure<T extends JSONStructure> = T extends
  (infer U extends JSONStructure)[] ? ExtractJSONStructure<U>[]
  : Partial<
    {
      [K in keyof T]: T[K] extends JSONStructure ? ExtractJSONStructure<T[K]>
        : T[K] extends JSONStructure[] ? ExtractJSONStructure<T[K][number]>[]
        : T[K] extends StringTypes[] ? string[]
        : T[K] extends BooleanTypes[] ? boolean[]
        : T[K] extends IntegerTypes[] ? number[]
        : T[K] extends DecimalTypes[] ? number[]
        : T[K] extends BigintTypes[] ? bigint[]
        : T[K] extends DateTypes[] ? Date[]
        : T[K] extends StringTypes ? string
        : T[K] extends BooleanTypes ? boolean
        : T[K] extends IntegerTypes ? number
        : T[K] extends DecimalTypes ? number
        : T[K] extends BigintTypes ? bigint
        : T[K] extends DateTypes ? Date
        : never;
    }
  > extends infer R ? { [K in keyof R]: R[K] }
  : never;

// type s = ExtractJSONStructure<{
//   a: 'VARCHAR',
//   b: [{
//     c: 'VARCHAR',
//     d: 'NUMERIC',
//   }]}>;
