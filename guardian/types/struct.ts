// deno-lint-ignore-file ban-types no-explicit-any
import { FunctionType, IsAsync, ResolvedValue } from "./Function.ts";
import { Primitive } from "./Primitive.ts";
import { GuardianProxy } from "./GuardianProxy.ts";

export type StructOptions = {
  message?: string;
  mode: "STRICT" | "DEFINED" | "PARTIAL" | "ALL";
  path: string[];
};

type IsStructAsync<S> = S extends FunctionType ? IsAsync<ReturnType<S>>
  : S extends object ? S extends RegExp ? false
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
      ? [undefined] extends [ResolvedValue<ReturnType<S[K]>>] ? K : never
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
  : [S] extends [Array<any>] ? { [K in keyof S]: StructResolveType<S[K]> }
  : S extends object
    ? { [K in keyof StructResolveTypeKeys<S>]: StructResolveType<S[K]> }
  : unknown extends S ? unknown
  : never;

export type StructValues =
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
  : [S] extends [Array<any>] ? [
      {
        [K in keyof S]: StructParameters<S[K]>[0];
      },
    ]
  : [S] extends [object]
    ? [{ [K in keyof StructKeysObject<S>]: StructParameters<S[K]>[0] }]
  : [unknown] extends [S] ? [unknown]
  : never;

export type StructValidatorFunction<S> = FunctionType<
  StructReturnType<S>,
  StructParameters<S>
>;

export type Type<S> = StructResolveType<S>;
