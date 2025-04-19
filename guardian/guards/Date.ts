import { format as dateFormat } from '$datetime/format';
import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { NumberGuardian } from './Number.ts';
import { StringGuardian } from './String.ts';
import { getType } from '../helpers/mod.ts';
/**
 * Predefined date format patterns for common use cases.
 */
export enum DateFormats {
  ISO = 'yyyy-MM-ddTHH:mm:ss.sssZ',
  US = 'MM/dd/yyyy',
  EU = 'dd/MM/yyyy',
  SQL = 'yyyy-MM-dd',
  SQL_TIME = 'HH:mm:ss',
  SQL_DATETIME = 'yyyy-MM-dd HH:mm:ss',
  SQL_DATETIME_MS = 'yyyy-MM-dd HH:mm:ss.sss',
}

/**
 * Time unit types that can be used for date operations.
 */
export type DateUnit =
  | 'years'
  | 'months'
  | 'days'
  | 'hours'
  | 'minutes'
  | 'seconds'
  | 'milliseconds';

/**
 * DateGuardian provides validation and transformation utilities for Date objects.
 * It extends BaseGuardian to provide a chainable API for date processing.
 *
 * @example
 * ```ts
 * const futureDate = DateGuardian.create()
 *   .future();
 *
 * // Validate a date
 * const tomorrow = new Date(Date.now() + 86400000);
 * const validatedDate = futureDate(tomorrow); // Returns: Date object
 * futureDate(new Date('2000-01-01')); // Throws: "Expected future date, got 2000-01-01T00:00:00.000Z"
 * ```
 */
export class DateGuardian extends BaseGuardian<FunctionType<Date>> {
  /**
   * Creates a new DateGuardian instance that validates if a value is a valid Date.
   * Accepts Date objects or values that can be parsed by the Date constructor.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const dateGuard = DateGuardian.create();
   * const date = dateGuard(new Date()); // Returns: Date object
   * dateGuard("2023-01-01"); // Returns: Date(2023-01-01)
   * dateGuard("not a date"); // Throws: "Expected valid date, got not a date"
   * ```
   */
  static create(error?: string): GuardianProxy<DateGuardian> {
    return new DateGuardian((value: unknown): Date => {
      if (value === null || value === undefined) {
        throw new GuardianError(
          { got: value, expected: 'Date', comparison: 'type' },
          error || 'Expected value to be a date, got ${got}',
        );
      }
      if (value instanceof Date) return value;
      const date = new Date(value as string);
      if (isNaN(date.getTime())) {
        throw new GuardianError(
          {
            got: value,
            expected: 'Date',
            comparison: 'type',
            type: getType(value),
          },
          error || 'Expected value to be a date, got ${type}',
        );
      }
      return date;
    }).proxy();
  }

  //#region Transformations
  /**
   * Format date to string with specified format.
   *
   * @param format - The date format pattern to use
   * @returns A StringGuardian instance containing the formatted date string
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01'))
   *   .format('yyyy-MM-dd'); // Returns StringGuardian with value "2023-01-01"
   * ```
   */
  public format(format: string): GuardianProxy<StringGuardian> {
    return this.transform((value) => dateFormat(value, format), StringGuardian);
  }

  /**
   * Format date to ISO string.
   *
   * @returns A StringGuardian instance containing the ISO formatted date string
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01')).iso();
   * // Returns StringGuardian with ISO formatted string
   * ```
   */
  public iso(): GuardianProxy<StringGuardian> {
    return this.format(DateFormats.ISO);
  }

  /**
   * Format date to UTC string.
   *
   * @returns A StringGuardian instance containing the UTC formatted date string
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01')).UTC();
   * // Returns StringGuardian with UTC formatted string
   * ```
   */
  public UTC(): GuardianProxy<StringGuardian> {
    return this.transform((value) => value.toUTCString(), StringGuardian);
  }

  /**
   * Set time to beginning of day (00:00:00.000).
   *
   * @returns A new DateGuardian instance with time set to start of day
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01T12:30:45')).startOfDay();
   * // Returns Date object set to 2023-01-01T00:00:00.000
   * ```
   */
  public startOfDay(): GuardianProxy<this> {
    return this.transform((value) => {
      const date = new Date(value);
      date.setHours(0, 0, 0, 0);
      return date;
    });
  }

  /**
   * Set time to end of day (23:59:59.999).
   *
   * @returns A new DateGuardian instance with time set to end of day
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01T12:30:45')).endOfDay();
   * // Returns Date object set to 2023-01-01T23:59:59.999
   * ```
   */
  public endOfDay(): GuardianProxy<this> {
    return this.transform((value) => {
      const date = new Date(value);
      date.setHours(23, 59, 59, 999);
      return date;
    });
  }

  /**
   * Set date to first day of the month.
   *
   * @returns A new DateGuardian instance with date set to first day of month and time to start of day
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-15T12:30:45')).startOfMonth();
   * // Returns Date object set to 2023-01-01T00:00:00.000
   * ```
   */
  public startOfMonth(): GuardianProxy<this> {
    return this.transform((value) => {
      const date = new Date(value);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    });
  }

  /**
   * Set date to last day of the month.
   *
   * @returns A new DateGuardian instance with date set to last day of month and time to end of day
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-15T12:30:45')).endOfMonth();
   * // Returns Date object set to 2023-01-31T23:59:59.999
   * ```
   */
  public endOfMonth(): GuardianProxy<this> {
    return this.transform((value) => {
      const date = new Date(value);
      date.setMonth(date.getMonth() + 1);
      date.setDate(0);
      date.setHours(23, 59, 59, 999);
      return date;
    });
  }

  /**
   * Set date to first day of the year.
   *
   * @returns A new DateGuardian instance with date set to first day of year and time to start of day
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-05-15T12:30:45')).startOfYear();
   * // Returns Date object set to 2023-01-01T00:00:00.000
   * ```
   */
  public startOfYear(): GuardianProxy<this> {
    return this.transform((value) => {
      const date = new Date(value);
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
      return date;
    });
  }

  /**
   * Set date to last day of the year.
   *
   * @returns A new DateGuardian instance with date set to last day of year and time to end of day
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-05-15T12:30:45')).endOfYear();
   * // Returns Date object set to 2023-12-31T23:59:59.999
   * ```
   */
  public endOfYear(): GuardianProxy<this> {
    return this.transform((value) => {
      const date = new Date(value);
      date.setMonth(11, 31);
      date.setHours(23, 59, 59, 999);
      return date;
    });
  }

  /**
   * Add a specified amount of time units to the date.
   *
   * @param amount - The amount of units to add
   * @param unit - The time unit to add (years, months, days, etc.)
   * @returns A new DateGuardian instance with the added time
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01')).add(1, 'months');
   * // Returns Date object set to 2023-02-01
   * ```
   */
  public add(amount: number, unit: DateUnit): GuardianProxy<this> {
    return this.transform((value) => {
      const date = new Date(value);
      switch (unit) {
        case 'years':
          date.setFullYear(date.getFullYear() + amount);
          break;
        case 'months':
          date.setMonth(date.getMonth() + amount);
          break;
        case 'days':
          date.setDate(date.getDate() + amount);
          break;
        case 'hours':
          date.setHours(date.getHours() + amount);
          break;
        case 'minutes':
          date.setMinutes(date.getMinutes() + amount);
          break;
        case 'seconds':
          date.setSeconds(date.getSeconds() + amount);
          break;
        case 'milliseconds':
          date.setMilliseconds(date.getMilliseconds() + amount);
          break;
      }
      return date;
    });
  }

  /**
   * Subtract a specified amount of time units from the date.
   *
   * @param amount - The amount of units to subtract
   * @param unit - The time unit to subtract (years, months, days, etc.)
   * @returns A new DateGuardian instance with the subtracted time
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01')).subtract(1, 'months');
   * // Returns Date object set to 2022-12-01
   * ```
   */
  public subtract(amount: number, unit: DateUnit): GuardianProxy<this> {
    return this.add(-amount, unit);
  }

  /**
   * Convert date to Unix timestamp (milliseconds since Unix epoch).
   *
   * @returns A NumberGuardian instance containing the timestamp
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01')).toTimestamp();
   * // Returns NumberGuardian with the timestamp value
   * ```
   */
  public toTimestamp(): GuardianProxy<NumberGuardian> {
    return this.transform((value) => value.getTime(), NumberGuardian);
  }

  /**
   * Format date as ISO date only (YYYY-MM-DD).
   *
   * @returns A StringGuardian instance containing the ISO date string
   *
   * @example
   * ```ts
   * DateGuardian.create()(new Date('2023-01-01T12:30:45')).toISODate();
   * // Returns StringGuardian with value "2023-01-01"
   * ```
   */
  public toISODate(): GuardianProxy<StringGuardian> {
    return this.format(DateFormats.SQL);
  }

  /**
   * Convert date to age in years.
   *
   * @returns A NumberGuardian instance containing the age in years
   *
   * @example
   * ```ts
   * // Assuming current date is 2023-01-01
   * DateGuardian.create()(new Date('2000-01-01')).age();
   * // Returns NumberGuardian with value 23
   * ```
   */
  public age(): GuardianProxy<NumberGuardian> {
    return this.transform((value) => {
      const now = new Date();
      const age = now.getFullYear() - value.getFullYear();
      if (
        now.getMonth() < value.getMonth() ||
        (now.getMonth() === value.getMonth() && now.getDate() < value.getDate())
      ) {
        return age - 1;
      }
      return age;
    }, NumberGuardian);
  }
  //#endregion Transformations

  //#region Validations
  /**
   * Validates date is after the specified date.
   *
   * @param min - The minimum date (inclusive) that the date must be after
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the minimum date validation applied
   *
   * @example
   * ```ts
   * const minDate = new Date('2023-01-01');
   * DateGuardian.create()(new Date('2022-12-31')).min(minDate);
   * // Throws: "Expected date (2022-12-31T00:00:00.000Z) to be after or equal to 2023-01-01T00:00:00.000Z"
   * ```
   */
  public min(min: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value >= min,
      error || 'Expected date (${got}) to be after or equal to ${expected}',
      min,
    );
  }

  /**
   * Validates date is before the specified date.
   *
   * @param max - The maximum date (inclusive) that the date must be before
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the maximum date validation applied
   *
   * @example
   * ```ts
   * const maxDate = new Date('2023-01-01');
   * DateGuardian.create()(new Date('2023-01-02')).max(maxDate);
   * // Throws: "Expected date (2023-01-02T00:00:00.000Z) to be before or equal to 2023-01-01T00:00:00.000Z"
   * ```
   */
  public max(max: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value <= max,
      error || 'Expected date (${got}) to be before or equal to ${expected}',
      max,
    );
  }

  /**
   * Validates date is between the specified dates (inclusive).
   *
   * @param min - The minimum date (inclusive) that the date must be after
   * @param max - The maximum date (inclusive) that the date must be before
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the date range validation applied
   *
   * @example
   * ```ts
   * const minDate = new Date('2023-01-01');
   * const maxDate = new Date('2023-01-31');
   * DateGuardian.create()(new Date('2023-02-01')).range(minDate, maxDate);
   * // Throws error about date being outside the range
   * ```
   */
  public range(min: Date, max: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value >= min && value <= max,
      error ||
        'Expected date (${got}) to be between ${expected[0]} and ${expected[1]}',
      [min, max],
    );
  }

  /**
   * Validates date is in the future (after current time).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the future validation applied
   *
   * @example
   * ```ts
   * // Assuming current date is 2023-01-01
   * DateGuardian.create()(new Date('2022-12-31')).future();
   * // Throws: "Expected future date, got 2022-12-31T00:00:00.000Z"
   * ```
   */
  public future(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value > new Date(),
      error || 'Expected future date, got ${got}',
    );
  }

  /**
   * Validates date is in the past (before current time).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the past validation applied
   *
   * @example
   * ```ts
   * // Assuming current date is 2023-01-01
   * DateGuardian.create()(new Date('2023-01-02')).past();
   * // Throws: "Expected past date, got 2023-01-02T00:00:00.000Z"
   * ```
   */
  public past(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value < new Date(),
      error || 'Expected past date, got ${got}',
    );
  }

  /**
   * Validates date falls on a weekday (Monday-Friday).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the weekday validation applied
   *
   * @example
   * ```ts
   * // For a Sunday
   * DateGuardian.create()(new Date('2023-01-01')).weekday();
   * // Throws: "Expected weekday (Monday-Friday), got 2023-01-01T00:00:00.000Z"
   * ```
   */
  public weekday(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => {
        const day = value.getDay();
        return day > 0 && day < 6; // 0 is Sunday, 6 is Saturday
      },
      error || 'Expected weekday (Monday-Friday), got ${got}',
    );
  }

  /**
   * Validates date falls on a weekend (Saturday-Sunday).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the weekend validation applied
   *
   * @example
   * ```ts
   * // For a Monday
   * DateGuardian.create()(new Date('2023-01-02')).weekend();
   * // Throws: "Expected weekend (Saturday-Sunday), got 2023-01-02T00:00:00.000Z"
   * ```
   */
  public weekend(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => {
        const day = value.getDay();
        return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
      },
      error || 'Expected weekend (Saturday-Sunday), got ${got}',
    );
  }

  /**
   * Validates date is the same day as another date.
   *
   * @param date - The date to compare with
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the same day validation applied
   *
   * @example
   * ```ts
   * const compareDate = new Date('2023-01-01T12:00:00');
   * DateGuardian.create()(new Date('2023-01-02')).sameDay(compareDate);
   * // Throws error about dates not being on the same day
   * ```
   */
  public sameDay(date: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => {
        return value.getDate() === date.getDate() &&
          value.getMonth() === date.getMonth() &&
          value.getFullYear() === date.getFullYear();
      },
      error || 'Expected date (${got}) to be on the same day as ${expected}',
      date,
    );
  }

  /**
   * Validates date is in the same month and year as another date.
   *
   * @param date - The date to compare with
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the same month validation applied
   *
   * @example
   * ```ts
   * const compareDate = new Date('2023-01-15');
   * DateGuardian.create()(new Date('2023-02-01')).sameMonth(compareDate);
   * // Throws error about dates not being in the same month
   * ```
   */
  public sameMonth(date: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => {
        return value.getMonth() === date.getMonth() &&
          value.getFullYear() === date.getFullYear();
      },
      error || 'Expected date (${got}) to be in the same month as ${expected}',
      date,
    );
  }

  /**
   * Validates date is in the same year as another date.
   *
   * @param date - The date to compare with
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the same year validation applied
   *
   * @example
   * ```ts
   * const compareDate = new Date('2023-06-15');
   * DateGuardian.create()(new Date('2022-06-15')).sameYear(compareDate);
   * // Throws error about dates not being in the same year
   * ```
   */
  public sameYear(date: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.getFullYear() === date.getFullYear(),
      error || 'Expected date (${got}) to be in the same year as ${expected}',
      date,
    );
  }

  /**
   * Validates date is strictly before another date.
   *
   * @param date - The date that the current date must be before
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the before validation applied
   *
   * @example
   * ```ts
   * const compareDate = new Date('2023-01-01');
   * DateGuardian.create()(new Date('2023-01-01')).isBefore(compareDate);
   * // Throws error as dates are equal, not before
   * ```
   */
  public isBefore(date: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value < date,
      error || 'Expected date (${got}) to be before ${expected}',
      date,
    );
  }

  /**
   * Validates date is strictly after another date.
   *
   * @param date - The date that the current date must be after
   * @param error - Custom error message to use when validation fails
   * @returns A new DateGuardian instance with the after validation applied
   *
   * @example
   * ```ts
   * const compareDate = new Date('2023-01-01');
   * DateGuardian.create()(new Date('2023-01-01')).isAfter(compareDate);
   * // Throws error as dates are equal, not after
   * ```
   */
  public isAfter(date: Date, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value > date,
      error || 'Expected date (${got}) to be after ${expected}',
      date,
    );
  }
  //#endregion Validations
}
