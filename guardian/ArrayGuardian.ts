import { BaseGuardian } from "./BaseGuardian.ts";
import { array } from "./utils.ts";
import type {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
  ResolvedValue,
  StructResolveType,
  StructReturnType,
} from "./types.ts";

/**
 * ArrayGuardian
 *
 * Guardian class for Array type. By default, array is set to Array<unknown>. Use of to
 * set a more specific type (event a Struct)
 *
 * @class ArrayGuardian
 */
export class ArrayGuardian<
  R extends unknown[] | PromiseLike<unknown[]> = unknown[],
  P extends FunctionParameters = [R],
> extends BaseGuardian<FunctionType<R, P>> {
  /**
   * of
   *
   * Convert from array<unknown> to array of specific type
   *
   * @param type S Must be a GuardianProxy class. You can add validations as part of this and it will be executed
   * @returns GuardianProxy<ArrayGuardian>
   */
  // deno-lint-ignore no-explicit-any
  of<S extends GuardianProxy<any>>(type: S): GuardianProxy<
    ArrayGuardian<StructReturnType<S, StructReturnType<S>[]>, P>
  > {
    // deno-lint-ignore no-explicit-any
    const validator = type as GuardianProxy<any>;
    const retFunc = (
      arr: ResolvedValue<R>,
    ): StructResolveType<S>[] | PromiseLike<StructResolveType<S>[]> => {
      let isAsync;
      const items = arr.map(
        (value): StructResolveType<S> | PromiseLike<StructResolveType<S>> => {
          const ret = validator(value);
          if (ret instanceof Promise) {
            isAsync = true;
          }
          return ret;
        },
      );
      if (!isAsync) {
        return items as StructResolveType<S>[];
      }
      return Promise.all(items) as unknown as StructResolveType<S>[];
    };

    return this.transform(retFunc) as unknown as GuardianProxy<
      ArrayGuardian<StructReturnType<S, StructReturnType<S>[]>, P>
    >;
  }

  /**
   * min
   *
   * Minimum length of array
   *
   * @param len number Min Length of array
   * @returns GuardianProxy<ArrayGuardian<R, P>>
   */
  min(len: number): GuardianProxy<ArrayGuardian<R, P>> {
    return this.test((arr: ResolvedValue<R>): boolean => {
      return arr.length >= len;
    }, `Array size must be greater than or equal to ${len}`);
  }

  /**
   * max
   *
   * Max length of the array
   *
   * @param len number Max Length of array
   * @returns GuardianProxy<ArrayGuardian<R, P>>
   */
  max(len: number) {
    return this.test((arr: ResolvedValue<R>): boolean => {
      return arr.length <= len;
    }, `Array size must be less than or equal to ${len}`);
  }

  /**
   * between
   *
   * Ensures the array is between min and max length
   *
   * @param min number Minimum length of array
   * @param max number Maximum length of array
   * @returns GuardianProxy<ArrayGuardian<R, P>>
   */
  between(min: number, max: number) {
    return this.test((arr: ResolvedValue<R>): boolean => {
      return arr.length >= min && arr.length <= max;
    }, `Array size must be between ${min} and ${max}`);
  }
}

export const arrayGuard = new ArrayGuardian(array()).proxy();
