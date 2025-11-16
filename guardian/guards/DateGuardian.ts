import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData } from '../types/mod.ts';
import { format } from '$datetime';

/**
 * Guardian for Date validation and transformation.
 * Provides fluent API for building Date validation pipelines.
 *
 * @example
 * ```ts
 * const schema = new DateGuardian()
 *   .min(new Date('2020-01-01'))
 *   .max(new Date('2030-12-31'));
 *
 * const result = schema.parse(new Date()); // current date
 * ```
 *
 * @since 1.0.0
 */
export class DateGuardian extends BaseGuardian<Date> {
  /**
   * Creates a new DateGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (!(input instanceof Date)) {
        throw new GuardianError('Expected Date but got ${got}', {
          expected: 'Date',
          got: typeof input,
          comparison: 'type',
          type: 'date',
        });
      }
      if (isNaN(input.getTime())) {
        throw new GuardianError('Date is invalid', {
          expected: 'valid Date',
          got: 'invalid Date',
          comparison: 'validity',
          type: 'date',
        });
      }
      return input;
    }, metaData);
  }

  //#region Range Validation Methods

  /**
   * Validates minimum date.
   *
   * @param date - Minimum allowed date
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with minimum date validation
   *
   * @example
   * ```ts
   * const schema = new DateGuardian().min(new Date('2020-01-01'));
   * schema.parse(new Date('2019-12-31')); // throws GuardianError
   * schema.parse(new Date('2020-06-01')); // valid
   * ```
   */
  min(date: Date, errorMessage?: string): DateGuardian {
    return this.step(
      (value: Date) => {
        if (value.getTime() < date.getTime()) {
          throw new GuardianError(
            errorMessage || 'Date must be at or after ${expected}',
            {
              expected: format(date, 'yyyy-MM-dd'),
              got: format(value, 'yyyy-MM-dd'),
              comparison: 'min',
              type: 'date',
            },
          );
        }
        return value;
      },
      `Minimum date validation (${format(date, 'yyyy-MM-dd')})`,
    ) as DateGuardian;
  }

  /**
   * Validates maximum date.
   *
   * @param date - Maximum allowed date
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with maximum date validation
   */
  max(date: Date, errorMessage?: string): DateGuardian {
    return this.step(
      (value: Date) => {
        if (value.getTime() > date.getTime()) {
          throw new GuardianError(
            errorMessage || 'Date must be at or before ${expected}',
            {
              expected: format(date, 'yyyy-MM-dd'),
              got: format(value, 'yyyy-MM-dd'),
              comparison: 'max',
              type: 'date',
            },
          );
        }
        return value;
      },
      `Maximum date validation (${format(date, 'yyyy-MM-dd')})`,
    ) as DateGuardian;
  }

  /**
   * Validates that date is in the past.
   *
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with past date validation
   */
  past(errorMessage?: string): DateGuardian {
    return this.step((value: Date) => {
      const now = new Date();
      if (value.getTime() >= now.getTime()) {
        throw new GuardianError(
          errorMessage || 'Date must be in the past',
          {
            expected: 'past date',
            got: format(value, 'yyyy-MM-dd HH:mm:ss'),
            comparison: 'past',
            type: 'date',
          },
        );
      }
      return value;
    }, 'Past date validation') as DateGuardian;
  }

  /**
   * Validates that date is in the future.
   *
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with future date validation
   */
  future(errorMessage?: string): DateGuardian {
    return this.step((value: Date) => {
      const now = new Date();
      if (value.getTime() <= now.getTime()) {
        throw new GuardianError(
          errorMessage || 'Date must be in the future',
          {
            expected: 'future date',
            got: format(value, 'yyyy-MM-dd HH:mm:ss'),
            comparison: 'future',
            type: 'date',
          },
        );
      }
      return value;
    }, 'Future date validation') as DateGuardian;
  }

  //#endregion

  //#region Date-specific Validation Methods

  /**
   * Validates that date falls on a specific weekday.
   *
   * @param weekday - Target weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with weekday validation
   */
  weekday(weekday: number, errorMessage?: string): DateGuardian {
    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    return this.step((value: Date) => {
      if (value.getDay() !== weekday) {
        throw new GuardianError(
          errorMessage || 'Date must be on ${expected}',
          {
            expected: weekdayNames[weekday],
            got: weekdayNames[value.getDay()],
            comparison: 'weekday',
            type: 'date',
          },
        );
      }
      return value;
    }, `Weekday validation (${weekdayNames[weekday]})`) as DateGuardian;
  }

  /**
   * Validates that date falls within business hours (9 AM - 5 PM).
   *
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with business hours validation
   */
  businessHours(errorMessage?: string): DateGuardian {
    return this.step((value: Date) => {
      const hours = value.getHours();
      if (hours < 9 || hours >= 17) {
        throw new GuardianError(
          errorMessage || 'Date must be during business hours (9 AM - 5 PM)',
          {
            expected: '9 AM - 5 PM',
            got: format(value, 'HH:mm'),
            comparison: 'businessHours',
            type: 'date',
          },
        );
      }
      return value;
    }, 'Business hours validation') as DateGuardian;
  }

  //#endregion

  //#region Transformation Methods

  /**
   * Formats date to string using the specified pattern.
   *
   * @param pattern - Date format pattern (using $datetime format function)
   * @returns New BaseGuardian<string> with formatted date string
   *
   * @example
   * ```ts
   * const schema = new DateGuardian().format('yyyy-MM-dd');
   * schema.parse(new Date('2023-06-15')); // '2023-06-15'
   * ```
   */
  format(pattern: string): BaseGuardian<string> {
    return this.mutate(
      (date: Date) => format(date, pattern),
      `Date formatting (${pattern})`,
    );
  }

  /**
   * Transforms date to ISO string.
   *
   * @returns New BaseGuardian<string> with ISO string transformation
   */
  toISOString(description?: string): BaseGuardian<string> {
    return this.mutate(
      (date: Date) => date.toISOString(),
      description || 'Convert to ISO string',
    );
  }

  /**
   * Transforms date to Unix timestamp (milliseconds).
   *
   * @returns New BaseGuardian<number> with timestamp transformation
   */
  toTimestamp(): BaseGuardian<number> {
    return this.mutate(
      (date: Date) => date.getTime(),
      'Date to timestamp transformation',
    );
  }

  /**
   * Transforms date to Unix timestamp (seconds).
   *
   * @returns New BaseGuardian<number> with Unix timestamp transformation
   */
  toUnixTimestamp(): BaseGuardian<number> {
    return this.mutate(
      (date: Date) => Math.floor(date.getTime() / 1000),
      'Date to Unix timestamp transformation',
    );
  }

  /**
   * Extracts specific component from date.
   *
   * @param component - Date component to extract
   * @returns New BaseGuardian<number> with extracted component
   *
   * @example
   * ```ts
   * const yearSchema = new DateGuardian().component('year');
   * yearSchema.parse(new Date('2023-06-15')); // 2023
   * ```
   */
  component(
    component: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second',
  ): BaseGuardian<number> {
    const extractors = {
      year: (date: Date) => date.getFullYear(),
      month: (date: Date) => date.getMonth() + 1, // 1-based month
      day: (date: Date) => date.getDate(),
      hour: (date: Date) => date.getHours(),
      minute: (date: Date) => date.getMinutes(),
      second: (date: Date) => date.getSeconds(),
    };

    return this.mutate(
      extractors[component],
      `Extract ${component} from date`,
    );
  }

  //#endregion
}
