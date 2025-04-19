// deno-lint-ignore-file no-explicit-any
import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { getType } from '../helpers/mod.ts';

/**
 * FunctionGuardian provides validation utilities for function values.
 * It extends BaseGuardian to provide a chainable API for function validation.
 *
 * @example
 * ```ts
 * const validFunction = FunctionGuardian.create()
 *   .parameters(2);
 *
 * // Validate a function
 * const fn = (a: number, b: number) => a + b;
 * const validatedFn = validFunction(fn); // Returns: fn
 * validFunction("not a function"); // Throws: "Expected function, got string"
 * ```
 */
export class FunctionGuardian<
  T extends (...args: any[]) => any,
> extends BaseGuardian<FunctionType<T>> {
  /**
   * Creates a new FunctionGuardian instance that validates if a value is a function.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const functionGuard = FunctionGuardian.create();
   * const fn = (a: number) => a * 2;
   * const validatedFn = functionGuard(fn); // Returns: fn
   * functionGuard("not a function"); // Throws: "Expected function, got string"
   * ```
   */
  static create<T extends (...args: any[]) => any>(
    error?: string,
  ): GuardianProxy<FunctionGuardian<T>> {
    return new FunctionGuardian<T>((value: unknown): T => {
      if (typeof value !== 'function') {
        throw new GuardianError(
          {
            got: value,
            expected: 'function',
            comparison: 'type',
            type: getType(value),
          },
          error || 'Expected function, got ${type}',
        );
      }
      return value as T;
    }).proxy();
  }

  //#region Validations
  /**
   * Validates that the function has exactly the specified number of parameters.
   *
   * @param count - The expected number of parameters
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the parameters validation applied
   *
   * @example
   * ```ts
   * const fn = (a: number, b: number) => a + b;
   * FunctionGuardian.create()(fn).parameters(2); // Valid
   * FunctionGuardian.create()(fn).parameters(3); // Throws: "Expected function to have 3 parameters, got 2"
   * ```
   */
  public parameters(count: number, error?: string): GuardianProxy<this> {
    return this.test(
      (fn) => fn.length === count,
      error ||
        `Expected function to have ${count} parameters`,
    );
  }

  /**
   * Validates that the function has at least the specified number of parameters.
   *
   * @param count - The minimum number of parameters
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the minParameters validation applied
   *
   * @example
   * ```ts
   * const fn = (a: number, b: number) => a + b;
   * FunctionGuardian.create()(fn).minParameters(1); // Valid
   * FunctionGuardian.create()(fn).minParameters(3); // Throws: "Expected function to have at least 3 parameters, got 2"
   * ```
   */
  public minParameters(count: number, error?: string): GuardianProxy<this> {
    return this.test(
      (fn) => fn.length >= count,
      error ||
        `Expected function to have at least ${count} parameters`,
    );
  }

  /**
   * Validates that the function has at most the specified number of parameters.
   *
   * @param count - The maximum number of parameters
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the maxParameters validation applied
   *
   * @example
   * ```ts
   * const fn = (a: number, b: number) => a + b;
   * FunctionGuardian.create()(fn).maxParameters(3); // Valid
   * FunctionGuardian.create()(fn).maxParameters(1); // Throws: "Expected function to have at most 1 parameter, got 2"
   * ```
   */
  public maxParameters(count: number, error?: string): GuardianProxy<this> {
    return this.test(
      (fn) => fn.length <= count,
      error ||
        `Expected function to have at most ${count} parameter${
          count === 1 ? '' : 's'
        }`,
    );
  }

  /**
   * Validates that the function is async (returns a Promise).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the isAsync validation applied
   *
   * @example
   * ```ts
   * const asyncFn = async () => 42;
   * const syncFn = () => 42;
   * FunctionGuardian.create()(asyncFn).isAsync(); // Valid
   * FunctionGuardian.create()(syncFn).isAsync(); // Throws: "Expected function to be async"
   * ```
   */
  public isAsync(error?: string): GuardianProxy<this> {
    return this.test(
      (fn) => {
        const result = fn();
        return result instanceof Promise ||
          (result && typeof result.then === 'function');
      },
      error || 'Expected function to be async',
    );
  }

  /**
   * Validates that the function is synchronous (does not return a Promise).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the isSync validation applied
   *
   * @example
   * ```ts
   * const asyncFn = async () => 42;
   * const syncFn = () => 42;
   * FunctionGuardian.create()(syncFn).isSync(); // Valid
   * FunctionGuardian.create()(asyncFn).isSync(); // Throws: "Expected function to be synchronous"
   * ```
   */
  public isSync(error?: string): GuardianProxy<this> {
    return this.test(
      (fn) => {
        const result = fn();
        return !(result instanceof Promise ||
          (result && typeof result.then === 'function'));
      },
      error || 'Expected function to be synchronous',
    );
  }
  //#endregion Validations
}
