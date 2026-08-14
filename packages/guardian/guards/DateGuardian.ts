/**
 * @fileoverview `DateGuardian` — coerce-by-default `Date` validator
 * with temporal-range checks (`.min` / `.max` / `.past` / `.future`),
 * calendar predicates (`year` / `month` / `weekday` / `weekend`),
 * and interval transforms (`.add` / `.subtract` / `.startOf`).
 *
 * @module
 */

import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { coerceDate } from '../helpers/coerce.ts';
import { gateAsyncStepResult } from '../helpers/thenable.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
import { format } from '@std/datetime';
import { NumberGuardian } from './NumberGuardian.ts';
import { StringGuardian } from './StringGuardian.ts';

/**
 * Type representing a unit of time for date operations.
 */
type DateUnit =
  | 'milliseconds'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'months'
  | 'years';

/**
 * Type representing a unit of time for duration operations (excluding months and years).
 */
type DurationUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';

/**
 * Date validator. Coerces parseable strings (ISO 8601, RFC 2822) and
 * ms-since-epoch numbers / bigints; rejects booleans, objects, and
 * unparseable strings. See {@link Guardian.date} for the standard
 * factory.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * const Recent = Guardian.date().past();
 * Recent.parse(new Date('2024-01-01'));   // Date
 * Recent.parse('2024-01-01');              // Date  ← coerced
 * Recent.parse(1704067200000);             // Date  ← coerced
 * ```
 *
 * @see {@link Guardian.date}
 */
export class DateGuardian extends BaseGuardian<Date> {
  // `_type = 'string'` because the JSON Schema / OpenAPI emit
  // represents dates as `{ type: 'string', format: 'date-time' }`.
  // Markdown emit appends the `format` so the output reads
  // `**Type:** string (date-time)`, which is reasonably clear.
  protected override readonly _type = 'string';

  /**
   * Creates a new DateGuardian instance.
   *
   * @param initialTransform - Optional composed transformation from previous guardian
   * @param metaData - Optional metadata for this guardian
   */
  constructor(
    initialTransform?: GuardianTransform<unknown, Date>,
    metaData?: GuardianMetaData,
  ) {
    // Coerce-by-default. Date instances pass through (still rejected
    // if invalid); ISO strings, ms timestamps, and bigints are
    // coerced via `coerceDate`.
    const defaultDateValidation = coerceDate;

    let finalTransform: GuardianTransform<unknown, Date>;
    if (initialTransform) {
      // Chain: initialTransform -> then date validation
      finalTransform = (input: unknown) => {
        const result = initialTransform(input);
        // A type-crossing transform reached via `.process(fn,
        // DateGuardian)` (e.g. `string().toDate()`, `number().toDate()`)
        // may sit on an async chain, in which case `initialTransform`
        // returns a Promise. Await it before coercion — otherwise the
        // synchronous coercion helper receives a Promise object and
        // throws "Cannot coerce object to Date". The guardian is
        // already flagged `isAsync` upstream, so `parseAsync` awaits
        // this. Only a real Promise is a leaked async step to thread
        // through `.then()`; a non-Promise thenable-shaped VALUE would be
        // ADOPTED (and silently destroyed) if `.then()` were called on
        // it, so refuse it loudly instead.
        if (result instanceof Promise) {
          return result.then((v) => defaultDateValidation(v));
        }
        return defaultDateValidation(gateAsyncStepResult(result));
      };
    } else {
      // Just date validation
      finalTransform = defaultDateValidation;
    }

    super(finalTransform, metaData);

    // Set default format to 'date-time' if not already set
    this._metaData ??= {};
    if (!this._metaData.format) {
      this._metaData.format = 'date-time';
    }
  }

  //#region Range Validation Methods

  /**
   * Validates minimum date.
   *
   * @param date - Minimum allowed date
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If date is before the specified minimum
   *
   * @example
   * ```ts
   * const schema = new DateGuardian().min(new Date('2020-01-01'));
   * schema.parse(new Date('2019-12-31')); // throws GuardianError
   * schema.parse(new Date('2020-06-01')); // valid
   * ```
   */
  min(date: Date, errorMessage?: string): this {
    return this.process((value: Date) => {
      if (value < date) {
        throw new GuardianError(
          errorMessage || `Date must be after ${date.toISOString()}`,
          {
            expected: `>= ${date.toISOString()}`,
            got: value.toISOString(),
            comparison: 'min',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates maximum date.
   *
   * @param date - Maximum allowed date
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If date is after the specified maximum
   */
  max(date: Date, errorMessage?: string): this {
    return this.process((value: Date) => {
      if (value.getTime() > date.getTime()) {
        throw new GuardianError(
          errorMessage || `Date must be at or before ${date.toISOString()}`,
          {
            expected: `<= ${date.toISOString()}`,
            got: value.toISOString(),
            comparison: 'max',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates that date is in the past.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If date is not in the past
   */
  past(errorMessage?: string): this {
    return this.process((value: Date) => {
      const now = new Date();
      if (value.getTime() >= now.getTime()) {
        throw new GuardianError(errorMessage || 'Date must be in the past', {
          expected: 'past date',
          got: value.toISOString(),
          comparison: 'past',
          type: 'validation',
        });
      }
      return value;
    }) as this;
  }

  /**
   * Validates that date is in the future.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If date is not in the future
   */
  future(errorMessage?: string): this {
    return this.process((value: Date) => {
      const now = new Date();
      if (value <= now) {
        throw new GuardianError(errorMessage || 'Date must be in the future', {
          expected: 'future date',
          got: value.toISOString(),
          comparison: 'future',
          type: 'validation',
        });
      }
      return value;
    }) as this;
  }

  //#endregion

  //#region Date-specific Validation Methods

  /**
   * Validates that date falls on a specific weekday.
   *
   * @param weekday - Target weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {Error} If `weekday` is not an integer in the range 0..6 — a
   *   config-time programming error (otherwise the message would read
   *   "must be on undefined").
   * @throws {GuardianError} If date does not fall on the specified weekday
   */
  weekday(weekday: number, errorMessage?: string): this {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error(
        'weekday must be an integer between 0 (Sunday) and 6 (Saturday)',
      );
    }
    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    return this.process((value: Date) => {
      if (value.getDay() !== weekday) {
        throw new GuardianError(
          errorMessage || `Date must be on ${weekdayNames[weekday]}`,
          {
            expected: weekdayNames[weekday],
            got: weekdayNames[value.getDay()],
            comparison: 'weekday',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates that date falls within business hours (9 AM - 5 PM).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If date time is outside business hours
   */
  businessHours(errorMessage?: string): this {
    return this.process((value: Date) => {
      const hours = value.getHours();
      if (hours < 9 || hours >= 17) {
        throw new GuardianError(
          errorMessage || 'Date must be during business hours (9 AM - 5 PM)',
          {
            expected: 'business hours (9 AM - 5 PM)',
            got: `${hours}:00`,
            comparison: 'businessHours',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates that the value is a **pure ISO-8601 date** — its UTC
   * time-of-day is exactly midnight (`00:00:00.000`), i.e. it carries
   * no time component. `'2023-06-15'` (which coerces to UTC midnight)
   * passes; `'2023-06-15T14:30:00Z'` fails.
   *
   * The counterpart is {@link isoTimeOnly}. Note this checks the coerced
   * *value*, not the raw input string (coercion has already run by the
   * time this validator sees the value).
   *
   * @param errorMessage - Optional custom error message.
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If the value carries a non-zero time-of-day.
   */
  isoDateOnly(errorMessage?: string): this {
    return this.process((value: Date) => {
      const hasTime = value.getUTCHours() !== 0 ||
        value.getUTCMinutes() !== 0 ||
        value.getUTCSeconds() !== 0 ||
        value.getUTCMilliseconds() !== 0;
      if (hasTime) {
        throw new GuardianError(
          errorMessage || 'Date must be date-only (no time component)',
          {
            expected: 'YYYY-MM-DD (UTC midnight)',
            got: value.toISOString(),
            comparison: 'isoDateOnly',
            type: 'date',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates that the value **carries an ISO-8601 time-of-day** — its
   * UTC time is not midnight. `'2023-06-15T14:30:00Z'` passes;
   * `'2023-06-15'` (which coerces to UTC midnight, i.e. no time) fails.
   *
   * Counterpart to {@link isoDateOnly}. Like it, this inspects the
   * coerced *value* rather than the raw input string.
   *
   * @param errorMessage - Optional custom error message.
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If the value has no time-of-day (UTC midnight).
   */
  isoTimeOnly(errorMessage?: string): this {
    return this.process((value: Date) => {
      const hasTime = value.getUTCHours() !== 0 ||
        value.getUTCMinutes() !== 0 ||
        value.getUTCSeconds() !== 0 ||
        value.getUTCMilliseconds() !== 0;
      if (!hasTime) {
        throw new GuardianError(
          errorMessage || 'Date must carry a time-of-day component',
          {
            expected: 'HH:MM:SS (non-midnight UTC time)',
            got: value.toISOString(),
            comparison: 'isoTimeOnly',
            type: 'date',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the date is strictly after today (local time, midnight
   * boundary). Shorthand for the common future + 1-day buffer.
   */
  afterToday(errorMessage?: string): this {
    return this.process((value: Date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const next = new Date(today);
      next.setDate(next.getDate() + 1);
      if (value.getTime() < next.getTime()) {
        throw new GuardianError(
          errorMessage || 'Date must be after today',
          {
            expected: '> today',
            got: value.toISOString(),
            comparison: 'afterToday',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the date is strictly before today (local time,
   * midnight boundary). Counterpart to {@link afterToday}.
   */
  beforeToday(errorMessage?: string): this {
    return this.process((value: Date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (value.getTime() >= today.getTime()) {
        throw new GuardianError(
          errorMessage || 'Date must be before today',
          {
            expected: '< today',
            got: value.toISOString(),
            comparison: 'beforeToday',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the date is within ±`amount` of `now` in the given unit.
   * Useful for "must be within the last 7 days" / "expires in less
   * than a month" patterns.
   *
   * @param amount - Magnitude (must be > 0).
   * @param unit   - `'seconds'` | `'minutes'` | `'hours'` | `'days'`
   *                 | `'weeks'`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.date().withinRange(7, 'days')   // ±7 days from now
   * Guardian.date().withinRange(1, 'hours')  // ±1 hour
   * ```
   */
  withinRange(
    amount: number,
    unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks',
    errorMessage?: string,
  ): this {
    if (amount <= 0) throw new Error('withinRange requires amount > 0');
    const multipliers = {
      seconds: 1000,
      minutes: 60_000,
      hours: 3_600_000,
      days: 86_400_000,
      weeks: 604_800_000,
    };
    const ms = amount * multipliers[unit];
    return this.process((value: Date) => {
      const now = Date.now();
      const delta = Math.abs(value.getTime() - now);
      if (delta > ms) {
        throw new GuardianError(
          errorMessage ||
            `Date must be within ${amount} ${unit} of now (off by ${
              Math.round(delta / multipliers[unit])
            } ${unit})`,
          {
            expected: `within ${amount} ${unit}`,
            got: value.toISOString(),
            comparison: 'withinRange',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the value represents an age of at least `years` (i.e.
   * birth date is at least `years` ago). One-sided counterpart to
   * the existing {@link ageRange}.
   */
  ageMin(years: number, errorMessage?: string): this {
    return this.process((value: Date) => {
      const age = computeAge(value);
      if (age < years) {
        throw new GuardianError(
          errorMessage || `Age must be at least ${years} (got ${age})`,
          {
            expected: `age >= ${years}`,
            got: age,
            comparison: 'ageMin',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the value represents an age of at most `years`. Useful
   * for forms with upper age bounds (e.g. "under 18 only").
   */
  ageMax(years: number, errorMessage?: string): this {
    return this.process((value: Date) => {
      const age = computeAge(value);
      if (age > years) {
        throw new GuardianError(
          errorMessage || `Age must be at most ${years} (got ${age})`,
          {
            expected: `age <= ${years}`,
            got: age,
            comparison: 'ageMax',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the date falls on the same calendar day as `other`
   * (local timezone, ignoring time-of-day).
   */
  sameDayAs(other: Date, errorMessage?: string): this {
    return this.process((value: Date) => {
      if (
        value.getFullYear() !== other.getFullYear() ||
        value.getMonth() !== other.getMonth() ||
        value.getDate() !== other.getDate()
      ) {
        throw new GuardianError(
          errorMessage ||
            `Date must be on the same day as ${other.toDateString()}`,
          {
            expected: other.toDateString(),
            got: value.toDateString(),
            comparison: 'sameDayAs',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the date falls in the same calendar month + year as
   * `other`.
   */
  sameMonthAs(other: Date, errorMessage?: string): this {
    return this.process((value: Date) => {
      if (
        value.getFullYear() !== other.getFullYear() ||
        value.getMonth() !== other.getMonth()
      ) {
        throw new GuardianError(
          errorMessage ||
            `Date must be in the same month as ${other.getFullYear()}-${
              String(other.getMonth() + 1).padStart(2, '0')
            }`,
          {
            expected: `same month as ${other.toISOString()}`,
            got: value.toISOString(),
            comparison: 'sameMonthAs',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the date falls in the same calendar year as `other`.
   */
  sameYearAs(other: Date, errorMessage?: string): this {
    return this.process((value: Date) => {
      if (value.getFullYear() !== other.getFullYear()) {
        throw new GuardianError(
          errorMessage ||
            `Date must be in the year ${other.getFullYear()}`,
          {
            expected: other.getFullYear(),
            got: value.getFullYear(),
            comparison: 'sameYearAs',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates the date falls within a given **fiscal year**, defined
   * by the month the FY starts (1-12). FY-X begins on
   * `startMonth/X-1` and ends on `startMonth-1/X`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * // US Federal FY: Oct (10) → Sep
   * Guardian.date().fiscalYear(10, 2026)
   *   // Oct 1 2025 → Sep 30 2026
   *
   * // India FY: Apr (4) → Mar
   * Guardian.date().fiscalYear(4, 2026)
   *   // Apr 1 2026 → Mar 31 2027
   * ```
   */
  fiscalYear(
    startMonth: number,
    year: number,
    errorMessage?: string,
  ): this {
    if (startMonth < 1 || startMonth > 12) {
      throw new Error('fiscalYear startMonth must be in 1..12');
    }
    // FY-Y begins at `startMonth` of (Y - 1 if startMonth > 1 else Y).
    const startCalYear = startMonth === 1 ? year : year - 1;
    const start = new Date(startCalYear, startMonth - 1, 1);
    const end = new Date(startCalYear + 1, startMonth - 1, 1);
    return this.process((value: Date) => {
      if (
        value.getTime() < start.getTime() || value.getTime() >= end.getTime()
      ) {
        throw new GuardianError(
          errorMessage ||
            `Date must be in FY${year} (${start.toDateString()} → ${end.toDateString()})`,
          {
            expected: `FY${year}`,
            got: value.toISOString(),
            comparison: 'fiscalYear',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  //#endregion

  //#region Format Methods

  /**
   * Sets format to date-only (no time component) for OpenAPI schema generation.
   * Note: This only affects the OpenAPI schema, not validation behavior.
   *
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.date().dateOnly();
   * schema.toOpenAPI(); // { type: 'string', format: 'date' }
   * ```
   */
  dateOnly(): this {
    return this.describe({ format: 'date' });
  }

  /**
   * Sets format to time-only (no date component) for OpenAPI schema generation.
   * Note: This only affects the OpenAPI schema, not validation behavior.
   *
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.date().timeOnly();
   * schema.toOpenAPI(); // { type: 'string', format: 'time' }
   * ```
   */
  timeOnly(): this {
    return this.describe({ format: 'time' });
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
  /**
   * Drop the inherited date `format` hint (`date-time` / `date` /
   * `time`) after a transform whose output is no longer a date. The
   * clone's metadata is a fresh copy (BaseGuardian copies on
   * construction), so this doesn't touch the source guardian.
   */
  private static __clearDateFormat<G extends BaseGuardian<unknown>>(
    guard: G,
  ): G {
    const meta =
      (guard as unknown as { _metaData?: GuardianMetaData })._metaData;
    if (meta) delete meta.format;
    return guard;
  }

  format(pattern: string): BaseGuardian<string> {
    // Cross into StringGuardian so the emitted schema reflects the
    // string output — otherwise the clone stays a DateGuardian
    // (`_type: 'string', format: 'date-time'`), which misdescribes an
    // arbitrarily-formatted string. Clear the inherited `date-time`
    // format hint too: the pattern is arbitrary, so we can't claim it.
    return DateGuardian.__clearDateFormat(
      this.process((date: Date) => format(date, pattern), StringGuardian),
    );
  }

  /**
   * Transforms date to ISO string.
   *
   * @returns This Guardian (mutated) or new instance if immutable mode
   */
  toISOString(): BaseGuardian<string> {
    return this.process((date: Date) => date.toISOString(), StringGuardian);
  }

  /**
   * Transforms date to Unix timestamp (milliseconds).
   *
   * @returns This Guardian (mutated) or new instance if immutable mode
   */
  toTimestamp(): BaseGuardian<number> {
    // Cross into NumberGuardian so the emitted schema is `type: number`
    // rather than the DateGuardian's `type: string`, and drop the
    // inherited `date-time` format hint (a number has no date format).
    return DateGuardian.__clearDateFormat(
      this.process((date: Date) => date.getTime(), NumberGuardian),
    );
  }

  /**
   * Transforms date to Unix timestamp (seconds).
   *
   * @returns This Guardian (mutated) or new instance if immutable mode
   */
  toUnixTimestamp(): BaseGuardian<number> {
    return DateGuardian.__clearDateFormat(
      this.process(
        (date: Date) => Math.floor(date.getTime() / 1000),
        NumberGuardian,
      ),
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

    return DateGuardian.__clearDateFormat(
      this.process(extractors[component], NumberGuardian),
    );
  }

  /**
   * Validates that date is between two dates (inclusive).
   *
   * @param start - Start date (inclusive)
   * @param end - End date (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  between(start: Date, end: Date, errorMessage?: string): this {
    return this.process((date: Date) => {
      const time = date.getTime();
      const startTime = start.getTime();
      const endTime = end.getTime();

      if (time < startTime || time > endTime) {
        throw new GuardianError(
          errorMessage ||
            `Date must be between ${start.toISOString()} and ${end.toISOString()}`,
          {
            expected: `between ${start.toISOString()} and ${end.toISOString()}`,
            got: date.toISOString(),
            comparison: 'between',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates age based on the date (treating date as birthdate).
   *
   * @param expectedAge - Expected age in years
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  age(expectedAge: number, errorMessage?: string): this {
    return this.process((date: Date) => {
      const today = new Date();
      const age = today.getFullYear() - date.getFullYear();
      const monthDiff = today.getMonth() - date.getMonth();
      const dayDiff = today.getDate() - date.getDate();

      const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)
        ? age - 1
        : age;

      if (actualAge !== expectedAge) {
        throw new GuardianError(
          errorMessage ||
            `Age must be ${expectedAge}, but calculated age is ${actualAge}`,
          {
            expected: expectedAge.toString(),
            got: actualAge.toString(),
            comparison: 'age',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates age is within a range (treating date as birthdate).
   *
   * @param minAge - Minimum age in years
   * @param maxAge - Maximum age in years
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  ageRange(
    minAge: number,
    maxAge: number,
    errorMessage?: string,
  ): this {
    return this.process((date: Date) => {
      const today = new Date();
      const age = today.getFullYear() - date.getFullYear();
      const monthDiff = today.getMonth() - date.getMonth();
      const dayDiff = today.getDate() - date.getDate();

      const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)
        ? age - 1
        : age;

      if (actualAge < minAge || actualAge > maxAge) {
        throw new GuardianError(
          errorMessage ||
            `Age must be between ${minAge} and ${maxAge}, but calculated age is ${actualAge}`,
          {
            expected: `${minAge} <= age <= ${maxAge}`,
            got: actualAge.toString(),
            comparison: 'ageRange',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates year is within a range.
   *
   * @param minYear - Minimum year
   * @param maxYear - Maximum year
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  yearRange(
    minYear: number,
    maxYear: number,
    errorMessage?: string,
  ): this {
    return this.process((date: Date) => {
      const year = date.getFullYear();

      if (year < minYear || year > maxYear) {
        throw new GuardianError(
          errorMessage || `Year must be between ${minYear} and ${maxYear}`,
          {
            expected: `${minYear} <= year <= ${maxYear}`,
            got: year.toString(),
            comparison: 'yearRange',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates month is within a range.
   *
   * @param minMonth - Minimum month (1-12)
   * @param maxMonth - Maximum month (1-12)
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  monthRange(
    minMonth: number,
    maxMonth: number,
    errorMessage?: string,
  ): this {
    return this.process((date: Date) => {
      const month = date.getMonth() + 1; // Convert to 1-based

      if (month < minMonth || month > maxMonth) {
        throw new GuardianError(
          errorMessage || `Month must be between ${minMonth} and ${maxMonth}`,
          {
            expected: `${minMonth} <= month <= ${maxMonth}`,
            got: month.toString(),
            comparison: 'monthRange',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates day is within a range.
   *
   * @param minDay - Minimum day (1-31)
   * @param maxDay - Maximum day (1-31)
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  dayRange(
    minDay: number,
    maxDay: number,
    errorMessage?: string,
  ): this {
    return this.process((date: Date) => {
      const day = date.getDate();

      if (day < minDay || day > maxDay) {
        throw new GuardianError(
          errorMessage || `Day must be between ${minDay} and ${maxDay}`,
          {
            expected: `${minDay} <= day <= ${maxDay}`,
            got: day.toString(),
            comparison: 'dayRange',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is in a specific quarter.
   *
   * @param quarter - Quarter number (1-4)
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  quarter(quarter: 1 | 2 | 3 | 4, errorMessage?: string): this {
    return this.process((date: Date) => {
      const month = date.getMonth() + 1; // Convert to 1-based
      const actualQuarter = Math.ceil(month / 3);

      if (actualQuarter !== quarter) {
        throw new GuardianError(
          errorMessage || `Date must be in quarter ${quarter}`,
          {
            expected: `quarter ${quarter}`,
            got: `quarter ${actualQuarter}`,
            comparison: 'quarter',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is in a leap year.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  leapYear(errorMessage?: string): this {
    return this.process((date: Date) => {
      const year = date.getFullYear();
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

      if (!isLeap) {
        throw new GuardianError(
          errorMessage || `Date must be in a leap year`,
          {
            expected: 'leap year',
            got: `non-leap year (${year})`,
            comparison: 'leapYear',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is not in a leap year.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  nonLeapYear(errorMessage?: string): this {
    return this.process((date: Date) => {
      const year = date.getFullYear();
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

      if (isLeap) {
        throw new GuardianError(
          errorMessage || `Date must not be in a leap year`,
          {
            expected: 'non-leap year',
            got: `leap year (${year})`,
            comparison: 'nonLeapYear',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is a weekday (Monday-Friday).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  weekdays(errorMessage?: string): this {
    return this.process((date: Date) => {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        throw new GuardianError(
          errorMessage || `Date must be a weekday`,
          {
            expected: 'weekday (Monday-Friday)',
            got: dayOfWeek === 0 ? 'Sunday' : 'Saturday',
            comparison: 'weekdays',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is a weekend (Saturday-Sunday).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  weekends(errorMessage?: string): this {
    return this.process((date: Date) => {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const days = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ];
        throw new GuardianError(
          errorMessage || `Date must be a weekend`,
          {
            expected: 'weekend (Saturday-Sunday)',
            got: days[dayOfWeek],
            comparison: 'weekends',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is a holiday from the provided list.
   *
   * @param holidays - Array of holiday dates
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  holiday(holidays: Date[], errorMessage?: string): this {
    return this.process((date: Date) => {
      const dateString = date.toDateString();
      const isHoliday = holidays.some((holiday) =>
        holiday.toDateString() === dateString
      );

      if (!isHoliday) {
        throw new GuardianError(
          errorMessage || `Date must be a holiday`,
          {
            expected: 'holiday',
            got: dateString,
            comparison: 'holiday',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is not a holiday from the provided list.
   *
   * @param holidays - Array of holiday dates
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  notHoliday(holidays: Date[], errorMessage?: string): this {
    return this.process((date: Date) => {
      const dateString = date.toDateString();
      const isHoliday = holidays.some((holiday) =>
        holiday.toDateString() === dateString
      );

      if (isHoliday) {
        throw new GuardianError(
          errorMessage || `Date must not be a holiday`,
          {
            expected: 'non-holiday',
            got: dateString,
            comparison: 'notHoliday',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date has a specific timezone offset.
   *
   * @param timezoneOffset - Expected timezone offset in minutes
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  timezone(timezoneOffset: number, errorMessage?: string): this {
    return this.process((date: Date) => {
      const actualOffset = date.getTimezoneOffset();

      if (actualOffset !== timezoneOffset) {
        throw new GuardianError(
          errorMessage ||
            `Date must have timezone offset ${timezoneOffset} minutes`,
          {
            expected: `timezone offset ${timezoneOffset}`,
            got: `timezone offset ${actualOffset}`,
            comparison: 'timezone',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Shift the instant to the wall-clock representation of a target
   * timezone. `timezoneOffset` is the target zone's UTC offset in
   * minutes (east-positive: `+330` for IST / UTC+5:30, `-300` for
   * UTC-5). The returned `Date`'s UTC fields (`getUTCHours()` etc.)
   * read as the wall clock in that zone.
   *
   * Deliberately does NOT consult `Date.prototype.getTimezoneOffset()`
   * — that reflects the HOST machine's zone, so the previous
   * implementation produced a different (and machine-dependent) instant
   * on every deployment region. The shift now depends only on the
   * supplied `timezoneOffset`, so the result is identical everywhere.
   *
   * @param timezoneOffset - Target UTC offset in minutes (east-positive).
   * @returns A new DateGuardian with the transform applied (the receiver is never mutated)
   */
  toTimezone(timezoneOffset: number): this {
    return this.process((date: Date) => {
      return new Date(date.getTime() + (timezoneOffset * 60 * 1000));
    }) as this;
  }

  /**
   * Normalise to the UTC instant. A JavaScript `Date` is an absolute
   * epoch instant that is already expressed in UTC (`getTime()` /
   * `toISOString()` are UTC), so "convert to UTC" does not change the
   * instant — this returns an equivalent `Date` with the same epoch
   * time.
   *
   * The previous implementation added `getTimezoneOffset()` (the HOST
   * machine's local offset), which fabricated a different instant that
   * varied per deployment region — a no-op on a UTC server, off by
   * 5.5h in IST, etc. Provided for chain readability / explicitness.
   *
   * @returns A new DateGuardian with the transform applied (the receiver is never mutated)
   */
  toUTC(): this {
    return this.process((date: Date) => {
      return new Date(date.getTime());
    }) as this;
  }

  /**
   * Validates date is within a time range from now.
   *
   * @param amount - Amount of time
   * @param unit - Time unit
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  within(
    amount: number,
    unit: DateUnit,
    errorMessage?: string,
  ): this {
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
            comparison: 'within',
            type: 'validation',
          },
        );
      }
      return date;
    }) as this;
  }

  /**
   * Validates date is recent (within specified time from now).
   *
   * @param amount - Amount of time
   * @param unit - Time unit
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  recent(
    amount: number,
    unit: DateUnit,
    errorMessage?: string,
  ): this {
    return this.within(
      amount,
      unit,
      errorMessage || `Date must be recent (within ${amount} ${unit})`,
    );
  }

  /**
   * Validates date is soon (within specified time from now).
   *
   * @param amount - Amount of time
   * @param unit - Time unit
   * @param errorMessage - Optional custom error message
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  soon(
    amount: number,
    unit:
      | 'milliseconds'
      | 'seconds'
      | 'minutes'
      | 'hours'
      | 'days'
      | 'months'
      | 'years',
    errorMessage?: string,
  ): this {
    return this.within(
      amount,
      unit,
      errorMessage || `Date must be soon (within ${amount} ${unit})`,
    );
  }

  /**
   * Adds time to the date.
   *
   * @param amount - Amount to add (can be negative)
   * @param unit - Time unit
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  add(
    amount: number,
    unit:
      | 'milliseconds'
      | 'seconds'
      | 'minutes'
      | 'hours'
      | 'days'
      | 'months'
      | 'years',
  ): this {
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
    }) as this;
  }

  /**
   * Adds days to the date.
   *
   * @param amount - Days to add (can be negative)
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  addDays(amount: number): this {
    return this.add(amount, 'days');
  }

  /**
   * Adds months to the date.
   *
   * @param amount - Months to add (can be negative)
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  addMonths(amount: number): this {
    return this.add(amount, 'months');
  }

  /**
   * Adds years to the date.
   *
   * @param amount - Years to add (can be negative)
   * @returns A new DateGuardian with the validation applied (the receiver is never mutated)
   */
  addYears(amount: number): this {
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
          return isPast
            ? `${count} ${unit.name}${plural} ago`
            : `in ${count} ${unit.name}${plural}`;
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
  duration(
    unit: DurationUnit = 'milliseconds',
  ): BaseGuardian<number> {
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
      const days = Math.floor(
        (date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
      );
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
      const days = Math.floor(
        (date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
      );
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
  diff(
    otherDate: Date,
    unit: DurationUnit = 'milliseconds',
  ): BaseGuardian<number> {
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

/**
 * Compute the age in completed years between `birth` and `now`.
 * Local-timezone aware — uses calendar months/days, not raw ms.
 *
 * @internal
 */
function computeAge(birth: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
