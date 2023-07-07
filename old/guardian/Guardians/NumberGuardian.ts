import { BaseGuardian } from '../BaseGuardian.ts';
import { DateGuardian } from './DateGuardian.ts';
import { type } from '../utils/mod.ts';
import type {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
} from '../types/mod.ts';

/**
 * NumberGuardian
 *
 * Guardian class for Number data type
 *
 * @class NumberGuardian
 */
export class NumberGuardian<
  P extends FunctionParameters = [number],
> extends BaseGuardian<FunctionType<number, P>> {
  //#region Manipulators
  toDate(): GuardianProxy<DateGuardian<P>> {
    return this.transform(
      (num: number) => new Date(String(num).length === 10 ? num * 1000 : num),
      DateGuardian,
    );
  }
  //#endregion Manipulators
  //#region Validators
  /**
   * float
   *
   * Checks if the number is a float
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  float(message?: string): GuardianProxy<this> {
    return this.test(
      (num: number) => Number.isFinite(num),
      message || 'Expect number to be a float',
    );
  }

  /**
   * integer
   *
   * Checks if the number is an integer
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  integer(message?: string): GuardianProxy<this> {
    return this.test(
      (num: number) => Number.isInteger(num),
      message || 'Expect number to be an integer',
    );
  }

  /**
   * min
   *
   * Checks if the number is greater than or equal to the specified length
   *
   * @param len number Length to check
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  min(len: number, message?: string): GuardianProxy<this> {
    return this.test(
      (num: number) => num >= len,
      message || `Expect number to be at least ${len}`,
    );
  }

  /**
   * max
   *
   * Checks if the number is less than or equal to the specified length
   *
   * @param len number Length to check
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  max(len: number, message?: string): GuardianProxy<this> {
    return this.test(
      (num: number) => num <= len,
      message || `Expect number to be at most ${len}`,
    );
  }

  gte = this.min;

  lte = this.max;

  /**
   * gt
   *
   * Checks if the number is greater than the specified length
   *
   * @param len number Length to check
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  gt(len: number, message?: string): GuardianProxy<this> {
    return this.test(
      (num: number) => num > len,
      message || `Expect number to be greater than ${len}`,
    );
  }

  /**
   * lt
   *
   * Checks if the number is less than the specified length
   *
   * @param len number Length to check
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  lt(len: number, message?: string): GuardianProxy<this> {
    return this.test(
      (num: number) => num < len,
      message || `Expect number to be less than ${len}`,
    );
  }

  /**
   * between
   *
   * Checks if the number is between min and max
   *
   * @param min number Minimum number
   * @param max number Maximum number
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  between(min: number, max: number, message?: string): GuardianProxy<this> {
    return this.test(
      (num: number) => num >= min && num <= max,
      message || `Expect number to be between ${min} and ${max}`,
    );
  }
  //#endregion Validators
}

export const numberGuard = new NumberGuardian(type('number')).proxy();
