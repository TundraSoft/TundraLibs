export type Primitive =
  | string
  | number
  | symbol
  | boolean
  | null
  | undefined
  | void
  | bigint;

export type Typeof = {
  'string': string;
  'number': number;
  'object': object; // eslint-disable-line @typescript-eslint/ban-types
  'boolean': boolean;
  'symbol': symbol;
  'bigint': bigint;
  'undefined': undefined;
};

type FunctionParameter = unknown;
function typeCast<T extends keyof Typeof, P extends FunctionParameter = Typeof[T]> (type: T) {
  return (arg: P): Typeof[T] => {
    if(typeof arg !== type || arg === null) {
      throw TypeError(`Expected ${type} got ${typeof arg}`)
    }
    return arg as Typeof[T];
  }
}

export type FunctionParameters = unknown[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FunctionType<R = any, P extends FunctionParameters = any[]> = (
...args: P
) => R;

export function type<
T extends keyof Typeof,
P extends FunctionParameters = [Typeof[T]],
>(type: T): FunctionType<Typeof[T], P> {
return (...args: P): Typeof[T] => {
  if (typeof args[0] !== type || args[0] === null) {
    // throw toError(error || `Expect value to be "${type}"`, ...args);
    throw Error('invalid type')
  }

  return args[0] as Typeof[T];
};
}

type Schema<T> = {
  [K in keyof T]: SchemaType<T[K]>
}

type BaseSchemaDefinition = {
  optional: boolean
}

type SchemaType<T> = {
  optional: boolean
  type: FunctionType
  typed: string, 
  // validate(t: T): boolean
}


type PartialPartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K> extends
  infer O ? { [P in keyof O]: O[P] } : never;

type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

type ExtractType<T extends { [K in keyof T]: SchemaType<any> }> = PartialPartial<{
  [K in keyof T]: T[K]['typed']
}, KeysMatching<T, { optional: true }>>


type Extractor<T extends { [K in keyof T]: SchemaType<unknown> }> = {
  [K in keyof T]: T[K]['typed']
}

const Schema = <S extends Record<keyof S, BaseSchemaDefinition>>(
  s: S
) => s;


const userSchema = Schema({
  id: {
    optional: false, 
    type: typeCast('string'), 
    typed: 'string'
  }, 
  age: {
    optional: true, 
    type: typeCast('number'), 
    typed: 'number'
  }
})

type User = ExtractType<typeof userSchema>
