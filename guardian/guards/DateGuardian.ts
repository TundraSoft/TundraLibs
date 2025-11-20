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
   * @param metaData - Optional metadata for this guardian
   * @param initialTransform - Optional composed transformation from previous guardian
   */
  constructor(metaData?: GuardianMetaData, initialTransform?: GuardianTransform<unknown, Date>) {
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

  //#endregion
}
