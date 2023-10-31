import { BaseGuardian } from '../BaseGuardian.ts';
import { type } from '../utils/mod.ts';
import type {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
} from '../types/mod.ts';

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

  /**
   * pattern
   *
   * Checks if the string matches the pattern
   *
   * @param reg RegExp Pattern to match
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  pattern(reg: RegExp, message?: string): GuardianProxy<this> {
    return this.test(
      (num: bigint) => reg.test(num.toString()),
      message || `Expected value to match pattern ${reg.toString()}`,
    );
  }

  /**
   * aadhaar
   *
   * Checks if the string is a valid AADHAAR number (INDIA)
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  aadhaar(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[2-9]{1}[0-9]{3}\\s*[0-9]{4}\\s*[0-9]{4}$/,
      message || `Expect value to be a valid Aadhaar`,
    );
  }

  /**
   * mobile
   *
   * Checks if the string is a valid mobile number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param pattern RegExp Pattern of mobile number to match. Defaults to /^[9|8|7|6][0-9]{9}$/
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  mobile(
    pattern = /^[6-9][0-9]{9}$/,
    message?: string,
  ): GuardianProxy<this> {
    return this.pattern(
      pattern,
      message || `Expect string to be a valid phone number`,
    );
  }
  //#endregion Validators
}

export const bigintGuard = new BigintGuardian(type('bigint')).proxy();
