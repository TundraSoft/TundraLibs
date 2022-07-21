import type { FunctionType, ValidatorProxy, FunctionParameters } from "./types.ts";

import { test } from "./utils.ts";

export type MergeSchemaParameters<P extends FunctionParameters> = [P] extends [
  never,
]
  ? [never]
  : [P] extends [[]]
  ? []
  : [P] extends [[unknown]]
  ? [P[0]]
  : [P] extends [[unknown?]]
  ? [P[0]?]
  : P;

export function optional<F extends FunctionType, R = undefined>(
    validator: F,
    defaultValue?: R,
  ): FunctionType<
    ReturnType<F> | R,
    MergeSchemaParameters<Parameters<F> | [(undefined | null)?]>
  > {
    return (
      ...args: MergeSchemaParameters<Parameters<F> | [(undefined | null)?]>
    ): ReturnType<F> | R => {
      if (args[0] == null || args[0] === '') {
        return defaultValue as R;
      }
  
      return validator(...args);
    };
  }

interface ValidatorConstructor<
  V extends Validator<F>,
  F extends FunctionType = V["validator"],
> {
  new (validator: F): V;
}

export class Validator<F extends FunctionType> {
  public readonly validator: F;

  public constructor(validator: F) {
    this.validator = validator;
  }

  public proxy(): ValidatorProxy<this> {
    return new Proxy(this.validator, {
      get: (
        _target: unknown,
        property: string,
      ): this[keyof this] | F[keyof F] =>
        property in this
          ? this[property as keyof this]
          : this.validator[property as keyof F],
    }) as ValidatorProxy<this>;
  }

  public test(tester: FunctionType<unknown, [ReturnType<F>]>, message: string): ValidatorProxy<this>  {
    return this.transform(test(tester, message));
  }

  public transform<
    T,
    V extends Validator<
      FunctionType<T, Parameters<F>>
    >,
  >(
    fn: FunctionType<T, [ReturnType<F>]>,
    constructor: ValidatorConstructor<V> = this
      .constructor as ValidatorConstructor<V>,
  ): ValidatorProxy<V> {
    const { validator } = this;

    return new constructor(
      ((...args): T | PromiseLike<T> => {
        const res = validator(...args);
        if (typeof res.then === "function") {
          return res.then((ret: ReturnType<F>) => fn(ret));
        } else {
          return fn(res);
        }
      }) as FunctionType<T, Parameters<F>>,
    ).proxy();
  }

  public optional<
    R extends ReturnType<F> | undefined = undefined,
  >(
    defaultValue?: R,
  ): ValidatorProxy<
    this,
    FunctionType<
      ReturnType<F> | R,
      MergeSchemaParameters<Parameters<F> | [(undefined | null)?]>
    >
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Class = (this as any).constructor;
    const { validator } = this;

    return new Class(optional<F, R>(validator, defaultValue)).proxy();
  }

  // public clone(): Validator<F> {
  //   const cloneObj = new (this.constructor as any)(this.validator);
  //   for (const attribut in this) {
  //     cloneObj[attribut] = this[attribut];
  //   }
  //   return cloneObj;
  // }
}