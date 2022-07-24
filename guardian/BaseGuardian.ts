import type {
  FunctionType,
  GuardianProxy,
  MaybeAsync,
  MergeParameters,
  ResolvedValue,
} from "./types.ts";
import { equals, isPromiseLike, optional, test } from "./utils.ts";

export interface GuardianConstructor<
  V extends BaseGuardian<F>,
  F extends FunctionType = V["guardian"],
> {
  new (guardian: F): V;
}

/**
 * BaseGuardian
 *
 * The base Guardian class. All other class inherit from this class.
 *
 * @class BaseGuardian
 */
export class BaseGuardian<F extends FunctionType> {
  public readonly guardian: F;

  public constructor(guardian: F) {
    this.guardian = guardian;
  }

  /**
   * proxy
   *
   * Creates a proxy for the guardian.
   *
   * @returns GuardianProxy<this>
   */
  public proxy(): GuardianProxy<this> {
    return new Proxy(this.guardian, {
      get: (_target: unknown, prop: string): this[keyof this] | F[keyof F] => {
        return (prop in this)
          ? this[prop as keyof this]
          : this.guardian[prop as keyof F];
      },
    }) as GuardianProxy<this>;
  }

  /**
   * equals
   *
   * Checks if the value is equal to the provided.
   *
   * @param value T Exact value match
   * @param error string Error message
   * @returns GuardianProxy<this>
   */
  public equals<T extends ResolvedValue<ReturnType<F>>>(
    value: T,
    error?: string,
  ): GuardianProxy<this, FunctionType<T, Parameters<F>>> {
    return this.transform(equals(value, error));
  }

  /**
   * test
   *
   * Adds a test function to the call stack.
   *
   * @param fn FunctionType<unknown, Parameters<F>> The test case function
   * @param error string Error message
   * @returns GuardianProxy<this>
   */
  public test(
    fn: FunctionType<unknown, [ResolvedValue<ReturnType<F>>]>,
    error?: string,
  ): GuardianProxy<this> {
    return this.transform(test(fn, error));
  }

  /**
   * transform
   *
   * Change the type of the guardian.
   *
   * @param fn FunctionType<unknown, Parameters<F>> The transform function
   * @param constructor The type to convert to
   * @returns GuardianProxy<constructor> The GuardianProxy of the constructor
   */
  public transform<
    T,
    V extends BaseGuardian<
      FunctionType<MaybeAsync<ReturnType<F>, T>, Parameters<F>>
    >,
  >(
    fn: FunctionType<T, [ResolvedValue<ReturnType<F>>]>,
    constructor: GuardianConstructor<V> = this
      .constructor as GuardianConstructor<V>,
  ): GuardianProxy<V> {
    const { guardian } = this;

    return new constructor(
      ((...args): T | PromiseLike<T> => {
        const res = guardian(...args);
        if (!isPromiseLike(res)) {
          return fn(res);
        }

        return res.then((ret) =>
          fn(ret as ResolvedValue<ReturnType<F>>)
        ) as PromiseLike<T>;
      }) as FunctionType<MaybeAsync<ReturnType<F>, T>, Parameters<F>>,
    ).proxy();
  }

  /**
   * optional
   *
   * Makes the type as optional. Optional means the value cannot be undefined. However, it can be null or empty.
   *
   * @param defaultValue T The default value to return if the value unknown
   * @returns GuardianProxy<this>
   */
  public optional<
    R extends ResolvedValue<ReturnType<F>> | undefined = undefined,
  >(
    defaultValue?: R,
  ): GuardianProxy<
    this,
    FunctionType<
      ReturnType<F> | R,
      MergeParameters<Parameters<F> | [undefined?]>
    >
  > {
    // deno-lint-ignore no-explicit-any
    const Class = (this as any).constructor;
    const { guardian } = this;
    return new Class(optional<F, R>(guardian, defaultValue)).proxy();
  }
}
