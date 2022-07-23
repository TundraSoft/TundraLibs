import { dateFormat } from "../dependencies.ts";
import { BaseGuardian } from "./BaseGuardian.ts";
import { StringGuardian } from "./StringGuardian.ts";
import { NumberGuardian } from "./NumberGuardian.ts";

import { type } from "./utils.ts";
import type {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
} from "./types.ts";

/**
 * DateGuardian
 *
 * Guardian class for Date data type
 *
 * @class DateGuardian
 */
export class DateGuardian<
  P extends FunctionParameters = [Date],
> extends BaseGuardian<FunctionType<Date, P>> {
  //#region Manipulators

  /**
   * toISOString
   *
   * Convert date to ISO string
   *
   * @returns GuardianProxy<StringGuardian<P>
   */
  public toISOString(): GuardianProxy<StringGuardian<P>> {
    return this.transform((d: Date) => d.toISOString(), StringGuardian);
  }

  /**
   * getTime
   *
   * Gets the time in milliseconds
   *
   * @returns GuardianProxy<NumberGuardian<P>>
   */
  public getTime(): GuardianProxy<NumberGuardian<P>> {
    return this.transform((d: Date) => d.getTime(), NumberGuardian);
  }

  /**
   * format
   *
   * Returns the date in the specified format as string
   *
   * @param format string Format to use
   * @returns GuardianProxy<StringGuardian<P>
   */
  public format(format: string): GuardianProxy<StringGuardian<P>> {
    return this.transform((d: Date) => dateFormat(d, format), StringGuardian);
  }
  //#endregion Manipulators

  //#region Validators
  /**
   * min
   *
   * Validate if date is greater than or equal to min
   *
   * @param date Date Date to compare to
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  min(date: Date, message?: string): GuardianProxy<this> {
    return this.test(
      (d: Date) => d >= date,
      message || `Expect date to be after ${date}`,
    );
  }

  /**
   * max
   *
   * Validate if date is less than or equal to max
   *
   * @param date Date Date to compare to
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  max(date: Date, message?: string): GuardianProxy<this> {
    return this.test(
      (d: Date) => d <= date,
      message || `Expect date to be before ${date}`,
    );
  }

  /**
   * between
   *
   * Validate if date is between min and max
   *
   * @param min Date Minimum date
   * @param max Date Maximum date
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  between(min: Date, max: Date, message?: string): GuardianProxy<this> {
    return this.test(
      (d: Date) => d >= min && d <= max,
      message || `Expect date to be between ${min} and ${max}`,
    );
  }

  gte = this.min;

  lte = this.max;

  /**
   * gt
   *
   * Validate if date is greater than min
   *
   * @param date Date Date to compare to
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  gt(date: Date, message?: string): GuardianProxy<this> {
    return this.test(
      (d: Date) => d > date,
      message || `Expect date to be after ${date}`,
    );
  }

  /**
   * lt
   *
   * Validate if date is less than max
   *
   * @param date Date Date to compare to
   * @param message string Error message
   * @returns GuardianProxy<this>
   */
  lt(date: Date, message?: string): GuardianProxy<this> {
    return this.test(
      (d: Date) => d < date,
      message || `Expect date to be before ${date}`,
    );
  }
  //#endregion Validators
}

// @TODO - Custom type implementation for date and allow parsing of date from number (epoch) or from string
export const dateGuard = new DateGuardian(type("date")).proxy();
