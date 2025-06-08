import type {
  FunctionType,
  GuardianProxy,
  MaybeAsync,
  MergeParameters,
  ResolvedValue,
} from './types/mod.ts';
import {
  equals,
  isIn,
  isNotIn,
  isPromiseLike,
  notEquals,
  optional,
  test,
} from './helpers/mod.ts';
import { GuardianError } from './GuardianError.ts';

/**
 * Generic constructor type for Guardian classes
 * @template V - Guardian class type extending BaseGuardian
 * @template F - Function type of the guardian, defaults to V['guardian']
 */
export type GuardianConstructor<
  V extends BaseGuardian<F>,
  F extends FunctionType = V['guardian'],
> = new (guardian: F) => V;

/**
 * Abstract base class for creating chainable validation guardians
 * Provides a foundation for building type-safe validation chains
 * @template F - Function type that the guardian wraps
 */
export abstract class BaseGuardian<F extends FunctionType> {
  /**
   * The wrapped guardian function
   */
  public readonly guardian: F;

  /**
   * Creates a new BaseGuardian instance
   * @param guardian - The function to be wrapped
   */
  public constructor(guardian: F) {
    this.guardian = guardian;
  }

  /**
   * Transforms the output of the guardian function using a transformation function
   * Preserves asynchronous behavior if the original guardian returns a Promise
   *
   * @template T - The return type of the transformation function
   * @template V - The type of the resulting Guardian instance
   * @param fn - The transformation function to apply to the guardian's result
   * @param constructor - Optional constructor for the resulting Guardian, defaults to this.constructor
   * @returns A new Guardian instance with the transformed function
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
   * Creates a proxy that combines the guardian function with the instance methods
   * Allows for direct invocation of the guardian while maintaining access to chainable methods
   *
   * @returns A proxy object that acts both as the guardian function and provides access to instance methods
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
   * Tests the result of the guardian function using a provided test function
   *
   * @param fn - The test function to apply to the guardian's result
   * @param error - Optional error message to use if the test fails
   * @returns A new Guardian instance with the test applied
   */
  public test(
    fn: FunctionType<unknown, [ResolvedValue<ReturnType<F>>]>,
    error?: string,
    expected?: unknown,
  ): GuardianProxy<this> {
    return this.transform(test(fn, error, expected));
  }

  /**
   * Checks if the result of the guardian function equals a specified value
   *
   * @template T - The type of the value to compare against
   * @param value - The value to compare against the guardian's result
   * @param error - Optional error message to use if the comparison fails
   * @returns A new Guardian instance with the equality check applied
   */
  public equals<T extends ResolvedValue<ReturnType<F>>>(
    value: T,
    error?: string,
  ): GuardianProxy<this, FunctionType<T, Parameters<F>>> {
    return this.transform(equals(value, error));
  }

  /**
   * Checks if the result of the guardian function does not equal a specified value
   *
   * @template T - The type of the value to compare against
   * @param value - The value to compare against the guardian's result
   * @param error - Optional error message to use if the comparison fails
   * @returns A new Guardian instance with the inequality check applied
   */
  public notEquals<T extends ResolvedValue<ReturnType<F>>>(
    value: T,
    error?: string,
  ): GuardianProxy<this, FunctionType<T, Parameters<F>>> {
    return this.transform(notEquals(value, error));
  }

  /**
   * Checks if the result of the guardian function is in a specified array of values
   *
   * @template T - The type of the values to compare against
   * @param values - The array of values to compare against the guardian's result
   * @param error - Optional error message to use if the comparison fails
   * @returns A new Guardian instance with the inclusion check applied
   */
  public in<T extends ResolvedValue<ReturnType<F>>>(
    values: T[],
    error?: string,
  ): GuardianProxy<this, FunctionType<T, Parameters<F>>> {
    return this.transform(isIn(values, error));
  }

  /**
   * Checks if the result of the guardian function is not in a specified array of values
   *
   * @template T - The type of the values to compare against
   * @param values - The array of values to compare against the guardian's result
   * @param error - Optional error message to use if the comparison fails
   * @returns A new Guardian instance with the exclusion check applied
   */
  public notIn<T extends ResolvedValue<ReturnType<F>>>(
    values: T[],
    error?: string,
  ): GuardianProxy<this, FunctionType<T, Parameters<F>>> {
    return this.transform(isNotIn(values, error));
  }

  /**
   * Makes the guardian function optional, providing a default value if the result is undefined
   *
   * @template R - The type of the default value, defaults to undefined
   * @param defaultValue - The default value or a function that returns the default value
   * @returns A new Guardian instance with the optional behavior applied
   */
  public optional<
    R extends ResolvedValue<ReturnType<F>> | undefined = undefined,
  >(
    defaultValue?: R | (() => R),
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

  public validate(
    value: unknown,
  ): [
    GuardianError | null,
    ResolvedValue<ReturnType<F>> | undefined,
  ] {
    try {
      const result = this.guardian(value);
      if (isPromiseLike(result)) {
        throw new Error('Guardian validation cannot return a Promise');
      }
      return [null, result as ResolvedValue<ReturnType<F>>];
    } catch (error) {
      if (error instanceof GuardianError) {
        return [error, undefined];
      } else {
        return [
          new GuardianError(
            {
              got: value,
              expected: this.guardian.name,
              comparison: 'validate',
            },
            (error as Error).message || 'Validation failed',
          ),
          undefined,
        ];
      }
    }
  }
}
