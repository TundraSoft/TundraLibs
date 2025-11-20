import { BaseGuardian } from "../BaseGuardian.ts";
import { GuardianError } from "../GuardianError.ts";
import type { GuardianMetaData, GuardianTransform } from "../types/mod.ts";
import { format } from "$datetime";

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
  protected override readonly _type = "string";

  /**
   * Creates a new DateGuardian instance.
   *
   * @param initialTransform - Optional composed transformation from previous guardian
   * @param metaData - Optional metadata for this guardian
   */
  constructor(initialTransform?: GuardianTransform<unknown, Date>, metaData?: GuardianMetaData) {
    const defaultDateValidation = (input: unknown) => {
      if (!(input instanceof Date)) {
        throw new GuardianError("Expected Date but got ${got}", {
          expected: "Date",
          got: typeof input,
          comparison: "type",
          type: "date",
        });
      }
      if (isNaN(input.getTime())) {
        throw new GuardianError("Date is invalid", {
          expected: "valid Date",
          got: "invalid Date",
          comparison: "validity",
          type: "date",
        });
      }
      return input;
    };

    let finalTransform: GuardianTransform<unknown, Date>;
    if (initialTransform) {
      // Chain: initialTransform -> then date validation
      finalTransform = (input: unknown) => {
        const result = initialTransform(input);
        return defaultDateValidation(result);
      };
    } else {
      // Just date validation
      finalTransform = defaultDateValidation;
    }

    super(finalTransform, metaData);
  }

  //#region Range Validation Methods

  /**
   * Validates minimum date.
   *
   * @param date - Minimum allowed date
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const schema = new DateGuardian().min(new Date('2020-01-01'));
   * schema.parse(new Date('2019-12-31')); // throws GuardianError
   * schema.parse(new Date('2020-06-01')); // valid
   * ```
   */
  min(date: Date, errorMessage?: string): DateGuardian {
    return this.process((value: Date) => {
      if (value < date) {
        throw new GuardianError(
          errorMessage || `Date must be after ${date.toISOString()}`,
          {
            expected: `>= ${date.toISOString()}`,
            got: value.toISOString(),
            comparison: "min",
            type: "validation",
          },
        );
      }
      return value;
    }) as DateGuardian;
  }

  /**
   * Validates maximum date.
   *
   * @param date - Maximum allowed date
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable mode
   */
  max(date: Date, errorMessage?: string): DateGuardian {
    return this.process((value: Date) => {
      if (value.getTime() > date.getTime()) {
        throw new GuardianError(
          errorMessage || `Date must be at or before ${date.toISOString()}`,
          {
            expected: `<= ${date.toISOString()}`,
            got: value.toISOString(),
            comparison: "max",
            type: "validation",
          },
        );
      }
      return value;
    }) as DateGuardian;
  }

  /**
   * Validates that date is in the past.
   *
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable mode
   */
  past(errorMessage?: string): DateGuardian {
    return this.process((value: Date) => {
      const now = new Date();
      if (value.getTime() >= now.getTime()) {
        throw new GuardianError(errorMessage || "Date must be in the past", {
          expected: "past date",
          got: value.toISOString(),
          comparison: "past",
          type: "validation",
        });
      }
      return value;
    }) as DateGuardian;
  }

  /**
   * Validates that date is in the future.
   *
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable mode
   */
  future(errorMessage?: string): DateGuardian {
    return this.process((value: Date) => {
      const now = new Date();
      if (value <= now) {
        throw new GuardianError(errorMessage || "Date must be in the future", {
          expected: "future date",
          got: value.toISOString(),
          comparison: "future",
          type: "validation",
        });
      }
      return value;
    }) as DateGuardian;
  }

  //#endregion

  //#region Date-specific Validation Methods

  /**
   * Validates that date falls on a specific weekday.
   *
   * @param weekday - Target weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable mode
   */
  weekday(weekday: number, errorMessage?: string): DateGuardian {
    const weekdayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    return this.process((value: Date) => {
      if (value.getDay() !== weekday) {
        throw new GuardianError(
          errorMessage || `Date must be on ${weekdayNames[weekday]}`,
          {
            expected: weekdayNames[weekday],
            got: weekdayNames[value.getDay()],
            comparison: "weekday",
            type: "validation",
          },
        );
      }
      return value;
    }) as DateGuardian;
  }

  /**
   * Validates that date falls within business hours (9 AM - 5 PM).
   *
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable mode
   */
  businessHours(errorMessage?: string): DateGuardian {
    return this.process((value: Date) => {
      const hours = value.getHours();
      if (hours < 9 || hours >= 17) {
        throw new GuardianError(
          errorMessage || "Date must be during business hours (9 AM - 5 PM)",
          {
            expected: "business hours (9 AM - 5 PM)",
            got: `${hours}:00`,
            comparison: "businessHours",
            type: "validation",
          },
        );
      }
      return value;
    }) as DateGuardian;
  }

  //#endregion

  //#region Transformation Methods

  /**
   * Formats date to string using the specified pattern.
   *
   * @param pattern - Date format pattern (using $datetime format function)
   * @returns This Guardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const schema = new DateGuardian().format('yyyy-MM-dd');
   * schema.parse(new Date('2023-06-15')); // '2023-06-15'
   * ```
   */
  format(pattern: string): BaseGuardian<string> {
    return this.process((date: Date) => format(date, pattern));
  }

  /**
   * Transforms date to ISO string.
   *
   * @returns This Guardian (mutated) or new instance if immutable mode
   */
  toISOString(): BaseGuardian<string> {
    return this.process((date: Date) => date.toISOString());
  }

  /**
   * Transforms date to Unix timestamp (milliseconds).
   *
   * @returns This Guardian (mutated) or new instance if immutable mode
   */
  toTimestamp(): BaseGuardian<number> {
    return this.process(
      (date: Date) => date.getTime(),
    );
  }

  /**
   * Transforms date to Unix timestamp (seconds).
   *
   * @returns This Guardian (mutated) or new instance if immutable mode
   */
  toUnixTimestamp(): BaseGuardian<number> {
    return this.process(
      (date: Date) => Math.floor(date.getTime() / 1000),
    );
  }

  /**
   * Extracts specific component from date.
   *
   * @param component - Date component to extract
   * @returns This Guardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const yearSchema = new DateGuardian().component('year');
   * yearSchema.parse(new Date('2023-06-15')); // 2023
   * ```
   */
  component(
    component: "year" | "month" | "day" | "hour" | "minute" | "second",
  ): BaseGuardian<number> {
    const extractors = {
      year: (date: Date) => date.getFullYear(),
      month: (date: Date) => date.getMonth() + 1, // 1-based month
      day: (date: Date) => date.getDate(),
      hour: (date: Date) => date.getHours(),
      minute: (date: Date) => date.getMinutes(),
      second: (date: Date) => date.getSeconds(),
    };

    return this.process(
      extractors[component],
    );
  }

  /**
   * Validates that date is between two dates (inclusive).
   *
   * @param start - Start date (inclusive)
   * @param end - End date (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  between(start: Date, end: Date, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const time = date.getTime();
      const startTime = start.getTime();
      const endTime = end.getTime();
      
      if (time < startTime || time > endTime) {
        throw new GuardianError(
          errorMessage || `Date must be between ${start.toISOString()} and ${end.toISOString()}`,
          {
            expected: `between ${start.toISOString()} and ${end.toISOString()}`,
            got: date.toISOString(),
            comparison: "between",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates age based on the date (treating date as birthdate).
   *
   * @param expectedAge - Expected age in years
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  age(expectedAge: number, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const today = new Date();
      const age = today.getFullYear() - date.getFullYear();
      const monthDiff = today.getMonth() - date.getMonth();
      const dayDiff = today.getDate() - date.getDate();
      
      const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
      
      if (actualAge !== expectedAge) {
        throw new GuardianError(
          errorMessage || `Age must be ${expectedAge}, but calculated age is ${actualAge}`,
          {
            expected: expectedAge.toString(),
            got: actualAge.toString(),
            comparison: "age",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates age is within a range (treating date as birthdate).
   *
   * @param minAge - Minimum age in years
   * @param maxAge - Maximum age in years
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  ageRange(minAge: number, maxAge: number, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const today = new Date();
      const age = today.getFullYear() - date.getFullYear();
      const monthDiff = today.getMonth() - date.getMonth();
      const dayDiff = today.getDate() - date.getDate();
      
      const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
      
      if (actualAge < minAge || actualAge > maxAge) {
        throw new GuardianError(
          errorMessage || `Age must be between ${minAge} and ${maxAge}, but calculated age is ${actualAge}`,
          {
            expected: `${minAge} <= age <= ${maxAge}`,
            got: actualAge.toString(),
            comparison: "ageRange",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates year is within a range.
   *
   * @param minYear - Minimum year
   * @param maxYear - Maximum year
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  yearRange(minYear: number, maxYear: number, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const year = date.getFullYear();
      
      if (year < minYear || year > maxYear) {
        throw new GuardianError(
          errorMessage || `Year must be between ${minYear} and ${maxYear}`,
          {
            expected: `${minYear} <= year <= ${maxYear}`,
            got: year.toString(),
            comparison: "yearRange",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates month is within a range.
   *
   * @param minMonth - Minimum month (1-12)
   * @param maxMonth - Maximum month (1-12)
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  monthRange(minMonth: number, maxMonth: number, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const month = date.getMonth() + 1; // Convert to 1-based
      
      if (month < minMonth || month > maxMonth) {
        throw new GuardianError(
          errorMessage || `Month must be between ${minMonth} and ${maxMonth}`,
          {
            expected: `${minMonth} <= month <= ${maxMonth}`,
            got: month.toString(),
            comparison: "monthRange",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates day is within a range.
   *
   * @param minDay - Minimum day (1-31)
   * @param maxDay - Maximum day (1-31)
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  dayRange(minDay: number, maxDay: number, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const day = date.getDate();
      
      if (day < minDay || day > maxDay) {
        throw new GuardianError(
          errorMessage || `Day must be between ${minDay} and ${maxDay}`,
          {
            expected: `${minDay} <= day <= ${maxDay}`,
            got: day.toString(),
            comparison: "dayRange",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is in a specific quarter.
   *
   * @param quarter - Quarter number (1-4)
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  quarter(quarter: 1 | 2 | 3 | 4, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const month = date.getMonth() + 1; // Convert to 1-based
      const actualQuarter = Math.ceil(month / 3);
      
      if (actualQuarter !== quarter) {
        throw new GuardianError(
          errorMessage || `Date must be in quarter ${quarter}`,
          {
            expected: `quarter ${quarter}`,
            got: `quarter ${actualQuarter}`,
            comparison: "quarter",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is in a leap year.
   *
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  leapYear(errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const year = date.getFullYear();
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      
      if (!isLeap) {
        throw new GuardianError(
          errorMessage || `Date must be in a leap year`,
          {
            expected: "leap year",
            got: `non-leap year (${year})`,
            comparison: "leapYear",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is not in a leap year.
   *
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  nonLeapYear(errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const year = date.getFullYear();
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      
      if (isLeap) {
        throw new GuardianError(
          errorMessage || `Date must not be in a leap year`,
          {
            expected: "non-leap year",
            got: `leap year (${year})`,
            comparison: "nonLeapYear",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is a weekday (Monday-Friday).
   *
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  weekdays(errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        throw new GuardianError(
          errorMessage || `Date must be a weekday`,
          {
            expected: "weekday (Monday-Friday)",
            got: dayOfWeek === 0 ? "Sunday" : "Saturday",
            comparison: "weekdays",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is a weekend (Saturday-Sunday).
   *
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  weekends(errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        throw new GuardianError(
          errorMessage || `Date must be a weekend`,
          {
            expected: "weekend (Saturday-Sunday)",
            got: days[dayOfWeek],
            comparison: "weekends",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is a holiday from the provided list.
   *
   * @param holidays - Array of holiday dates
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  holiday(holidays: Date[], errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const dateString = date.toDateString();
      const isHoliday = holidays.some(holiday => holiday.toDateString() === dateString);
      
      if (!isHoliday) {
        throw new GuardianError(
          errorMessage || `Date must be a holiday`,
          {
            expected: "holiday",
            got: dateString,
            comparison: "holiday",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is not a holiday from the provided list.
   *
   * @param holidays - Array of holiday dates
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  notHoliday(holidays: Date[], errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const dateString = date.toDateString();
      const isHoliday = holidays.some(holiday => holiday.toDateString() === dateString);
      
      if (isHoliday) {
        throw new GuardianError(
          errorMessage || `Date must not be a holiday`,
          {
            expected: "non-holiday",
            got: dateString,
            comparison: "notHoliday",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date has a specific timezone offset.
   *
   * @param timezoneOffset - Expected timezone offset in minutes
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  timezone(timezoneOffset: number, errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const actualOffset = date.getTimezoneOffset();
      
      if (actualOffset !== timezoneOffset) {
        throw new GuardianError(
          errorMessage || `Date must have timezone offset ${timezoneOffset} minutes`,
          {
            expected: `timezone offset ${timezoneOffset}`,
            got: `timezone offset ${actualOffset}`,
            comparison: "timezone",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Transforms date to a specific timezone.
   *
   * @param timezoneOffset - Target timezone offset in minutes
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  toTimezone(timezoneOffset: number): DateGuardian {
    return this.process((date: Date) => {
      const currentOffset = date.getTimezoneOffset();
      const offsetDiff = currentOffset - timezoneOffset;
      return new Date(date.getTime() + (offsetDiff * 60 * 1000));
    }) as DateGuardian;
  }

  /**
   * Transforms date to UTC.
   *
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  toUTC(): DateGuardian {
    return this.process((date: Date) => {
      return new Date(date.getTime() + (date.getTimezoneOffset() * 60 * 1000));
    }) as DateGuardian;
  }

  /**
   * Validates date is within a time range from now.
   *
   * @param amount - Amount of time
   * @param unit - Time unit
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  within(amount: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years', errorMessage?: string): DateGuardian {
    return this.process((date: Date) => {
      const now = new Date();
      const multipliers = {
        milliseconds: 1,
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        months: 30 * 24 * 60 * 60 * 1000, // Approximate
        years: 365 * 24 * 60 * 60 * 1000, // Approximate
      };
      
      const timeRange = amount * multipliers[unit];
      const diff = Math.abs(date.getTime() - now.getTime());
      
      if (diff > timeRange) {
        throw new GuardianError(
          errorMessage || `Date must be within ${amount} ${unit} of now`,
          {
            expected: `within ${amount} ${unit}`,
            got: `${Math.round(diff / multipliers[unit])} ${unit} away`,
            comparison: "within",
            type: "validation",
          },
        );
      }
      return date;
    }) as DateGuardian;
  }

  /**
   * Validates date is recent (within specified time from now).
   *
   * @param amount - Amount of time
   * @param unit - Time unit
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  recent(amount: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years', errorMessage?: string): DateGuardian {
    return this.within(amount, unit, errorMessage || `Date must be recent (within ${amount} ${unit})`);
  }

  /**
   * Validates date is soon (within specified time from now).
   *
   * @param amount - Amount of time
   * @param unit - Time unit
   * @param errorMessage - Optional custom error message
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  soon(amount: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years', errorMessage?: string): DateGuardian {
    return this.within(amount, unit, errorMessage || `Date must be soon (within ${amount} ${unit})`);
  }

  /**
   * Adds time to the date.
   *
   * @param amount - Amount to add (can be negative)
   * @param unit - Time unit
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  add(amount: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years'): DateGuardian {
    return this.process((date: Date) => {
      const result = new Date(date);
      
      switch (unit) {
        case 'milliseconds':
          result.setTime(result.getTime() + amount);
          break;
        case 'seconds':
          result.setTime(result.getTime() + (amount * 1000));
          break;
        case 'minutes':
          result.setTime(result.getTime() + (amount * 60 * 1000));
          break;
        case 'hours':
          result.setTime(result.getTime() + (amount * 60 * 60 * 1000));
          break;
        case 'days':
          result.setDate(result.getDate() + amount);
          break;
        case 'months':
          result.setMonth(result.getMonth() + amount);
          break;
        case 'years':
          result.setFullYear(result.getFullYear() + amount);
          break;
      }
      
      return result;
    }) as DateGuardian;
  }

  /**
   * Adds days to the date.
   *
   * @param amount - Days to add (can be negative)
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  addDays(amount: number): DateGuardian {
    return this.add(amount, 'days');
  }

  /**
   * Adds months to the date.
   *
   * @param amount - Months to add (can be negative)
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  addMonths(amount: number): DateGuardian {
    return this.add(amount, 'months');
  }

  /**
   * Adds years to the date.
   *
   * @param amount - Years to add (can be negative)
   * @returns This DateGuardian (mutated) or new instance if immutable
   */
  addYears(amount: number): DateGuardian {
    return this.add(amount, 'years');
  }

  /**
   * Formats date as relative time (e.g., "2 hours ago", "in 3 days").
   *
   * @returns New StringGuardian with relative format
   */
  formatRelative(): BaseGuardian<string> {
    return this.process((date: Date) => {
      const now = new Date();
      const diff = date.getTime() - now.getTime();
      const absDiff = Math.abs(diff);
      const isPast = diff < 0;
      
      const units = [
        { name: 'year', milliseconds: 365 * 24 * 60 * 60 * 1000 },
        { name: 'month', milliseconds: 30 * 24 * 60 * 60 * 1000 },
        { name: 'day', milliseconds: 24 * 60 * 60 * 1000 },
        { name: 'hour', milliseconds: 60 * 60 * 1000 },
        { name: 'minute', milliseconds: 60 * 1000 },
        { name: 'second', milliseconds: 1000 },
      ];
      
      for (const unit of units) {
        const count = Math.floor(absDiff / unit.milliseconds);
        if (count >= 1) {
          const plural = count === 1 ? '' : 's';
          return isPast ? `${count} ${unit.name}${plural} ago` : `in ${count} ${unit.name}${plural}`;
        }
      }
      
      return 'just now';
    });
  }

  /**
   * Calculates duration between date and now.
   *
   * @param unit - Unit to return duration in
   * @returns New NumberGuardian with duration
   */
  duration(unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' = 'milliseconds'): BaseGuardian<number> {
    return this.process((date: Date) => {
      const now = new Date();
      const diff = Math.abs(date.getTime() - now.getTime());
      
      const multipliers = {
        milliseconds: 1,
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
      };
      
      return Math.floor(diff / multipliers[unit]);
    });
  }

  /**
   * Gets the week number of the year.
   *
   * @returns New NumberGuardian with week number
   */
  weekNumber(): BaseGuardian<number> {
    return this.process((date: Date) => {
      const start = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      return Math.ceil((days + start.getDay() + 1) / 7);
    });
  }

  /**
   * Gets the day of the year (1-366).
   *
   * @returns New NumberGuardian with day of year
   */
  dayOfYear(): BaseGuardian<number> {
    return this.process((date: Date) => {
      const start = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      return days + 1;
    });
  }

  /**
   * Calculates difference between this date and another date.
   *
   * @param otherDate - Date to compare with
   * @param unit - Unit to return difference in
   * @returns New NumberGuardian with difference
   */
  diff(otherDate: Date, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' = 'milliseconds'): BaseGuardian<number> {
    return this.process((date: Date) => {
      const diff = date.getTime() - otherDate.getTime();
      
      const multipliers = {
        milliseconds: 1,
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
      };
      
      return Math.floor(diff / multipliers[unit]);
    });
  }

  //#endregion
}
