import { BaseGuardian } from "../BaseGuardian.ts";
import { type } from "../utils/mod.ts";
import type {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
} from "../types/mod.ts";

/**
 * BigintGuardian
 *
 * Guardian class for BigInt data type
 *
 * @class BigintGuardian
 */
export class BigintGuardian<
  P extends FunctionParameters = [bigint],
> extends BaseGuardian<FunctionType<bigint, P>> {
  //#region Validators
  /**
   * min
   *
   * Validate if number is greater than or equal to min
   *
   * @param len bigint Minimum value
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  min(len: bigint, message?: string): GuardianProxy<this> {
    return this.test(
      (num: bigint) => num >= len,
      message || `Expect number to be at least ${len}`,
    );
  }

  /**
   * max
   *
   * Validate if number is less than or equal to max
   *
   * @param len bigint Maximum value
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  max(len: bigint, message?: string): GuardianProxy<this> {
    return this.test(
      (num: bigint) => num <= len,
      message || `Expect number to be at most ${len}`,
    );
  }

  /**
   * between
   *
   * Checks if the value is between the provided min and max
   *
   * @param min bigint Minimum value
   * @param max bigint Maximum value
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  between(min: bigint, max: bigint, message?: string): GuardianProxy<this> {
    return this.test(
      (num: bigint) => num >= min && num <= max,
      message || `Expect number to be between ${min} and ${max}`,
    );
  }

  gte = this.min;

  lte = this.max;

  /**
   * gt
   *
   * Checks if the value is greater than the provided value
   *
   * @param len bigint Value to check
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  gt(len: bigint, message?: string): GuardianProxy<this> {
    return this.test(
      (num: bigint) => num > len,
      message || `Expect number to be greater than ${len}`,
    );
  }

  /**
   * lt
   *
   * Checks if the value is less than the provided value
   *
   * @param len bigint Value to check
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  lt(len: bigint, message?: string): GuardianProxy<this> {
    return this.test(
      (num: bigint) => num < len,
      message || `Expect number to be less than ${len}`,
    );
  }

  //#endregion Validators
}

export const bigintGuard = new BigintGuardian(type("bigint")).proxy();
