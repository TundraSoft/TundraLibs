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
  string: string;
  number: number;
  // deno-lint-ignore ban-types
  object: object;
  boolean: boolean;
  symbol: symbol;
  bigint: bigint;
  undefined: undefined;
  date: Date;
};

export type FunctionParameters = unknown[];

// deno-lint-ignore no-explicit-any
export type FunctionType<R = any, P extends FunctionParameters = any[]> = (
  ...args: P
) => R;

export type MergeParameters<P extends FunctionParameters> = [P] extends [
  never,
] ? [never]
  : [P] extends [[]] ? []
  : [P] extends [[unknown]] ? [P[0]]
  : [P] extends [[unknown?]] ? [P[0]?]
  : P;

export type ObjectProperty = string | number | symbol;

// The proxy object
export type GuardianProxy<
  V extends { guardian: FunctionType },
  F extends FunctionType = V["guardian"],
> = Omit<V, "guardian" | "proxy"> & { guardian: F } & F;

// do not escape T to [T] to support `number | Promise<string>`
export type ResolvedValue<T> = T extends PromiseLike<infer R> ? R : T;

// deno-lint-ignore no-explicit-any
export type RemoveAsync<T> = T extends PromiseLike<any> ? never : T;

export type IsAsync<S> = ResolvedValue<S> extends S
  ? unknown extends S ? unknown
  : false
  : RemoveAsync<S> extends never ? true
  : unknown;

export type MaybeAsync<T, V> = unknown extends IsAsync<T> ? PromiseLike<V> | V
  : true extends IsAsync<T> ? PromiseLike<V>
  : V;

type IsStructAsync<S> = S extends FunctionType ? IsAsync<ReturnType<S>>
  : // deno-lint-ignore ban-types
  S extends object ? S extends RegExp ? false
  : { [K in keyof S]: IsStructAsync<S[K]> }[keyof S]
  : IsAsync<S>;

export type StructReturnType<
  S,
  R = StructResolveType<S>,
> = unknown extends IsStructAsync<S> ? PromiseLike<R> | R
  : true extends IsStructAsync<S> ? PromiseLike<R>
  : R;

type StructResolveTypeUndefinedKeys<S> = Exclude<
  {
    [K in keyof S]: [S[K]] extends [FunctionType]
      ? [undefined] extends [ResolvedValue<ReturnType<S[K]>>] ? K
      : never
      : [undefined] extends [S[K]] ? K
      : never;
  }[keyof S],
  undefined
>;

type StructResolveTypeNonUndefinedKeys<S> = Exclude<
  keyof S,
  StructResolveTypeUndefinedKeys<S>
>;

type StructResolveTypeKeys<S> =
  & {
    [K in keyof S & StructResolveTypeNonUndefinedKeys<S>]: K;
  }
  & {
    [K in keyof S & StructResolveTypeUndefinedKeys<S>]?: K;
  };

export type StructResolveType<S> = S extends FunctionType
  ? ResolvedValue<ReturnType<S>>
  : S extends Primitive ? S
  : S extends RegExp ? string
  : // deno-lint-ignore no-explicit-any
  [S] extends [Array<any>] ? { [K in keyof S]: StructResolveType<S[K]> }
  : // deno-lint-ignore ban-types
  S extends object
    ? { [K in keyof StructResolveTypeKeys<S>]: StructResolveType<S[K]> }
  : unknown extends S ? unknown
  : never;

export type StructValues =
  // deno-lint-ignore no-explicit-any
  | GuardianProxy<any>
  | string
  | boolean
  | Date
  | number
  | bigint
  | Array<unknown>;

type StructOptionalKeys<S> = Exclude<
  {
    [K in keyof S]: [S[K]] extends [FunctionType]
      ? [] extends Parameters<S[K]> ? K
      : never
      : [undefined] extends [S[K]] ? K
      : never;
  }[keyof S],
  undefined
>;

type StructRequiredKeys<S> = Exclude<keyof S, StructOptionalKeys<S>>;

type StructKeysObject<S> =
  & {
    [K in keyof S & StructRequiredKeys<S>]: K;
  }
  & {
    [K in keyof S & StructOptionalKeys<S>]?: K;
  };

export type StructParameters<S> = [S] extends [FunctionType] ? Parameters<S>
  : [S] extends [Primitive] ? [S]
  : [S] extends [RegExp] ? [string]
  : // deno-lint-ignore no-explicit-any
  [S] extends [Array<any>] ? [
    {
      [K in keyof S]: StructParameters<S[K]>[0];
    },
  ]
  : // deno-lint-ignore ban-types
  [S] extends [object]
    ? [{ [K in keyof StructKeysObject<S>]: StructParameters<S[K]>[0] }]
  : [unknown] extends [S] ? [unknown]
  : never;

export type StructValidatorFunction<S> = FunctionType<
  StructReturnType<S>,
  StructParameters<S>
>;

export type Type<S> = StructResolveType<S>;
