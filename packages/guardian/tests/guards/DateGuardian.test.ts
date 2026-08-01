import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { DateGuardian, GuardianError } from '../../mod.ts';

describe('guardian.DateGuardian', () => {
  describe('basic functionality', () => {
    it('should validate date type', () => {
      const guardian = new DateGuardian();
      const date = new Date('2023-06-15');

      asserts.assertEquals(guardian.parse(date), date);

      // Coerce-by-default: ISO strings + ms timestamps coerce to Date.
      asserts.assertEquals(
        guardian.parse('2023-06-15').getTime(),
        new Date('2023-06-15').getTime(),
      );
      asserts.assertEquals(
        guardian.parse(1687000000000).getTime(),
        new Date(1687000000000).getTime(),
      );

      // Non-coercible / invalid inputs still throw.
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
      asserts.assertThrows(() => guardian.parse('not-a-date'), GuardianError);
      asserts.assertThrows(() => guardian.parse(true), GuardianError);
      asserts.assertThrows(() => guardian.parse({}), GuardianError);
    });

    it('should reject invalid dates', () => {
      const guardian = new DateGuardian();
      const invalidDate = new Date('invalid');

      asserts.assertThrows(() => guardian.parse(invalidDate), GuardianError);
    });

    it('should preserve valid dates', () => {
      const guardian = new DateGuardian();
      const date = new Date('2023-06-15T14:30:00');

      asserts.assertEquals(guardian.parse(date), date);
    });
  });

  describe('range validations', () => {
    it('should validate minimum date', () => {
      const minDate = new Date('2020-01-01');
      const guardian = new DateGuardian().min(minDate);

      asserts.assertEquals(
        guardian.parse(new Date('2020-01-01')),
        new Date('2020-01-01'),
      );
      asserts.assertEquals(
        guardian.parse(new Date('2023-06-15')),
        new Date('2023-06-15'),
      );

      asserts.assertThrows(
        () => guardian.parse(new Date('2019-12-31')),
        GuardianError,
      );
    });

    it('should validate maximum date', () => {
      const maxDate = new Date('2030-12-31');
      const guardian = new DateGuardian().max(maxDate);

      asserts.assertEquals(
        guardian.parse(new Date('2030-12-31')),
        new Date('2030-12-31'),
      );
      asserts.assertEquals(
        guardian.parse(new Date('2023-06-15')),
        new Date('2023-06-15'),
      );

      asserts.assertThrows(
        () => guardian.parse(new Date('2031-01-01')),
        GuardianError,
      );
    });

    it('should combine min and max dates', () => {
      const guardian = new DateGuardian()
        .min(new Date('2020-01-01'))
        .max(new Date('2030-12-31'));

      asserts.assertEquals(
        guardian.parse(new Date('2023-06-15')),
        new Date('2023-06-15'),
      );

      asserts.assertThrows(
        () => guardian.parse(new Date('2019-12-31')),
        GuardianError,
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2031-01-01')),
        GuardianError,
      );
    });

    it('should validate past dates', () => {
      const guardian = new DateGuardian().past();
      const pastDate = new Date('2020-01-01');

      asserts.assertEquals(guardian.parse(pastDate), pastDate);

      // Future date should fail
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      asserts.assertThrows(() => guardian.parse(futureDate), GuardianError);
    });

    it('should validate future dates', () => {
      const guardian = new DateGuardian().future();
      const futureDate = new Date(Date.now() + 86400000); // tomorrow

      asserts.assertEquals(guardian.parse(futureDate), futureDate);

      // Past date should fail
      const pastDate = new Date('2020-01-01');
      asserts.assertThrows(() => guardian.parse(pastDate), GuardianError);
    });
  });

  describe('date-specific validations', () => {
    it('should validate weekday', () => {
      const monday = new Date('2023-06-12'); // Monday
      const tuesday = new Date('2023-06-13'); // Tuesday

      const mondayGuardian = new DateGuardian().weekday(1); // Monday

      asserts.assertEquals(mondayGuardian.parse(monday), monday);
      asserts.assertThrows(() => mondayGuardian.parse(tuesday), GuardianError);
    });

    it('rejects out-of-range weekday at construction', () => {
      // Out-of-range previously produced "must be on undefined" at parse
      // time; now it's a config-time programming error.
      asserts.assertThrows(
        () => new DateGuardian().weekday(9),
        Error,
        'integer between 0',
      );
      asserts.assertThrows(() => new DateGuardian().weekday(-1), Error);
      asserts.assertThrows(() => new DateGuardian().weekday(7), Error);
      asserts.assertThrows(() => new DateGuardian().weekday(1.5), Error);
      // Valid range constructs without throwing.
      new DateGuardian().weekday(0);
      new DateGuardian().weekday(6);
    });

    it('should validate business hours', () => {
      const businessHour = new Date('2023-06-15T14:00:00'); // 2 PM
      const afterHours = new Date('2023-06-15T20:00:00'); // 8 PM

      const guardian = new DateGuardian().businessHours();

      asserts.assertEquals(guardian.parse(businessHour), businessHour);
      asserts.assertThrows(() => guardian.parse(afterHours), GuardianError);
    });
  });

  describe('transformations', () => {
    it('should format dates', () => {
      const guardian = new DateGuardian().format('yyyy-MM-dd');
      const date = new Date('2023-06-15T14:30:00');

      asserts.assertEquals(guardian.parse(date), '2023-06-15');
    });

    it('should format time', () => {
      const guardian = new DateGuardian().format('HH:mm:ss');
      const date = new Date('2023-06-15T14:30:45');

      asserts.assertEquals(guardian.parse(date), '14:30:45');
    });

    it('should format full datetime', () => {
      const guardian = new DateGuardian().format('yyyy-MM-dd HH:mm:ss');
      const date = new Date('2023-06-15T14:30:45');

      asserts.assertEquals(guardian.parse(date), '2023-06-15 14:30:45');
    });

    it('should convert to ISO string', () => {
      const guardian = new DateGuardian().toISOString();
      const date = new Date('2023-06-15T14:30:00Z');

      asserts.assertEquals(guardian.parse(date), '2023-06-15T14:30:00.000Z');
    });

    it('should convert to timestamp', () => {
      const guardian = new DateGuardian().toTimestamp();
      const date = new Date('2023-06-15T14:30:00Z');

      asserts.assertEquals(guardian.parse(date), date.getTime());
    });

    it('should convert to unix timestamp', () => {
      const guardian = new DateGuardian().toUnixTimestamp();
      const date = new Date('2023-06-15T14:30:00Z');

      asserts.assertEquals(
        guardian.parse(date),
        Math.floor(date.getTime() / 1000),
      );
    });

    it('should extract date components', () => {
      const date = new Date('2023-06-15T14:30:45');

      const yearGuardian = new DateGuardian().component('year');
      asserts.assertEquals(yearGuardian.parse(date), 2023);

      const monthGuardian = new DateGuardian().component('month');
      asserts.assertEquals(monthGuardian.parse(date), 6); // 1-based month

      const dayGuardian = new DateGuardian().component('day');
      asserts.assertEquals(dayGuardian.parse(date), 15);

      const hourGuardian = new DateGuardian().component('hour');
      asserts.assertEquals(hourGuardian.parse(date), 14);

      const minuteGuardian = new DateGuardian().component('minute');
      asserts.assertEquals(minuteGuardian.parse(date), 30);

      const secondGuardian = new DateGuardian().component('second');
      asserts.assertEquals(secondGuardian.parse(date), 45);
    });

    it('emits a schema matching the transformed output type', () => {
      // Regression: these transforms kept the DateGuardian runtime
      // class, so `toOpenAPI()` emitted `{ type: 'string', format:
      // 'date-time' }` even when the output was a number / plain string.
      asserts.assertEquals(
        new DateGuardian().toTimestamp().toOpenAPI(),
        { type: 'number' },
      );
      asserts.assertEquals(
        new DateGuardian().toUnixTimestamp().toOpenAPI(),
        { type: 'number' },
      );
      asserts.assertEquals(
        new DateGuardian().component('year').toOpenAPI(),
        { type: 'number' },
      );
      // An arbitrary format string is a string with no asserted format.
      asserts.assertEquals(
        new DateGuardian().format('yyyy-MM-dd').toOpenAPI(),
        { type: 'string' },
      );
      // toISOString genuinely yields a date-time string, so the format
      // hint is retained.
      asserts.assertEquals(
        new DateGuardian().toISOString().toOpenAPI(),
        { type: 'string', format: 'date-time' },
      );
      // JSON Schema variant carries the number type through too.
      const jsonSchema = new DateGuardian().toTimestamp().toJSONSchema();
      asserts.assertEquals(jsonSchema.type, 'number');
      asserts.assertEquals(jsonSchema.format, undefined);
    });
  });

  describe('isoDateOnly / isoTimeOnly', () => {
    it('isoDateOnly accepts a pure date and rejects a date with a time', () => {
      const guardian = new DateGuardian().isoDateOnly();
      // Accept: coerces to UTC midnight, no time component.
      asserts.assertEquals(
        guardian.parse('2023-06-15').toISOString(),
        '2023-06-15T00:00:00.000Z',
      );
      asserts.assertEquals(
        guardian.parse(new Date(Date.UTC(2023, 5, 15))).toISOString(),
        '2023-06-15T00:00:00.000Z',
      );
      // Reject: carries a time-of-day.
      asserts.assertThrows(
        () => guardian.parse('2023-06-15T14:30:00Z'),
        GuardianError,
        'date-only',
      );
      asserts.assertThrows(
        () => guardian.parse('2023-06-15T00:00:00.500Z'),
        GuardianError,
      );
    });

    it('isoTimeOnly accepts a time-carrying value and rejects a pure date', () => {
      const guardian = new DateGuardian().isoTimeOnly();
      // Accept: carries a non-midnight time-of-day.
      asserts.assertEquals(
        guardian.parse('2023-06-15T14:30:00Z').toISOString(),
        '2023-06-15T14:30:00.000Z',
      );
      // Reject: UTC midnight — no time component.
      asserts.assertThrows(
        () => guardian.parse('2023-06-15'),
        GuardianError,
        'time-of-day',
      );
      asserts.assertThrows(
        () => guardian.parse(new Date(Date.UTC(2023, 5, 15))),
        GuardianError,
      );
    });

    it('iso validators honor a custom error message', () => {
      const guardian = new DateGuardian().isoDateOnly('date only please');
      asserts.assertThrows(
        () => guardian.parse('2023-06-15T14:30:00Z'),
        GuardianError,
        'date only please',
      );
    });
  });

  describe('chained validations', () => {
    it('should chain date validations', () => {
      const guardian = new DateGuardian()
        .min(new Date('2020-01-01'))
        .max(new Date('2030-12-31'))
        .past();

      const validDate = new Date('2022-06-15');
      asserts.assertEquals(guardian.parse(validDate), validDate);

      // Too early
      asserts.assertThrows(
        () => guardian.parse(new Date('2019-01-01')),
        GuardianError,
      );

      // Too late
      asserts.assertThrows(
        () => guardian.parse(new Date('2031-01-01')),
        GuardianError,
      );
    });

    it('should chain validations and transformations', () => {
      const guardian = new DateGuardian()
        .past()
        .format('yyyy-MM-dd');

      const pastDate = new Date('2020-06-15');
      asserts.assertEquals(guardian.parse(pastDate), '2020-06-15');
    });
  });

  describe('safe parsing', () => {
    it('should return success result for valid input', () => {
      const guardian = new DateGuardian();
      const date = new Date('2023-06-15');
      const [error, result] = guardian.safeParse(date);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, date);
    });

    it('should return error result for invalid input', () => {
      const guardian = new DateGuardian();

      // Coerce-by-default: ISO date string now succeeds.
      const [okErr, okData] = guardian.safeParse('2023-06-15');
      asserts.assertEquals(okErr, null);
      asserts.assertInstanceOf(okData, Date);

      // Genuinely unparseable input still errors.
      const [error, result] = guardian.safeParse('not-a-date');
      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const guardian = new DateGuardian();

      // Unparseable date string is rejected by coerceDate with a clear message.
      asserts.assertThrows(
        () => guardian.parse('not-a-real-date'),
        GuardianError,
        'Cannot coerce',
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('invalid')),
        GuardianError,
        'Date is invalid',
      );
    });

    it('should support custom error messages', () => {
      const guardian = new DateGuardian().past('Date must be in the past');
      const futureDate = new Date(Date.now() + 86400000);

      asserts.assertThrows(
        () => guardian.parse(futureDate),
        GuardianError,
        'Date must be in the past',
      );
    });
  });

  describe('real world usage', () => {
    it('should validate birth date', () => {
      const guardian = new DateGuardian()
        .min(new Date('1900-01-01'))
        .max(new Date('2010-12-31'))
        .past();

      const validBirthDate = new Date('1990-05-15');
      asserts.assertEquals(guardian.parse(validBirthDate), validBirthDate);

      // Too old
      asserts.assertThrows(
        () => guardian.parse(new Date('1899-12-31')),
        GuardianError,
      );

      // Too recent
      asserts.assertThrows(
        () => guardian.parse(new Date('2011-01-01')),
        GuardianError,
      );
    });

    it('should validate appointment scheduling', () => {
      const guardian = new DateGuardian()
        .future()
        .weekday(1) // Monday only
        .businessHours();

      // Create a future Monday at 2 PM
      const futureMonday = new Date();
      futureMonday.setDate(
        futureMonday.getDate() +
          ((1 + 7 - futureMonday.getDay()) % 7 || 7),
      ); // Next Monday (always strictly in the future, even if today is Monday)
      futureMonday.setHours(14, 0, 0, 0); // 2 PM

      asserts.assertEquals(guardian.parse(futureMonday), futureMonday);
    });
  });

  describe('new validation methods', () => {
    it('between validation', () => {
      const start = new Date('2020-01-01');
      const end = new Date('2025-12-31');
      const guardian = new DateGuardian().between(start, end);

      asserts.assertEquals(
        guardian.parse(new Date('2023-06-15')),
        new Date('2023-06-15'),
      );
      asserts.assertEquals(guardian.parse(start), start);
      asserts.assertEquals(guardian.parse(end), end);

      asserts.assertThrows(
        () => guardian.parse(new Date('2019-12-31')),
        GuardianError,
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2026-01-01')),
        GuardianError,
      );
    });

    it('age validation', () => {
      const today = new Date();
      const birthDate = new Date(
        today.getFullYear() - 25,
        today.getMonth(),
        today.getDate(),
      );
      const guardian = new DateGuardian().age(25);

      asserts.assertEquals(guardian.parse(birthDate), birthDate);

      const wrongAge = new Date(
        today.getFullYear() - 30,
        today.getMonth(),
        today.getDate(),
      );
      asserts.assertThrows(() => guardian.parse(wrongAge), GuardianError);
    });

    it('age range validation', () => {
      const today = new Date();
      const validAge = new Date(
        today.getFullYear() - 30,
        today.getMonth(),
        today.getDate(),
      );
      const guardian = new DateGuardian().ageRange(18, 65);

      asserts.assertEquals(guardian.parse(validAge), validAge);

      const tooYoung = new Date(
        today.getFullYear() - 16,
        today.getMonth(),
        today.getDate(),
      );
      const tooOld = new Date(
        today.getFullYear() - 70,
        today.getMonth(),
        today.getDate(),
      );

      asserts.assertThrows(() => guardian.parse(tooYoung), GuardianError);
      asserts.assertThrows(() => guardian.parse(tooOld), GuardianError);
    });

    it('year range validation', () => {
      const guardian = new DateGuardian().yearRange(2020, 2025);

      asserts.assertEquals(
        guardian.parse(new Date('2023-06-15')),
        new Date('2023-06-15'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2019-12-31')),
        GuardianError,
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2026-01-01')),
        GuardianError,
      );
    });

    it('month range validation', () => {
      const guardian = new DateGuardian().monthRange(6, 8); // June to August

      asserts.assertEquals(
        guardian.parse(new Date('2023-07-15')),
        new Date('2023-07-15'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-05-15')),
        GuardianError,
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-09-15')),
        GuardianError,
      );
    });

    it('day range validation', () => {
      const guardian = new DateGuardian().dayRange(15, 25);

      asserts.assertEquals(
        guardian.parse(new Date('2023-06-20')),
        new Date('2023-06-20'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-06-10')),
        GuardianError,
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-06-30')),
        GuardianError,
      );
    });

    it('quarter validation', () => {
      const guardian = new DateGuardian().quarter(2); // Q2: April-June

      asserts.assertEquals(
        guardian.parse(new Date('2023-05-15')),
        new Date('2023-05-15'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-03-15')),
        GuardianError,
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-07-15')),
        GuardianError,
      );
    });

    it('leap year validation', () => {
      const guardian = new DateGuardian().leapYear();

      asserts.assertEquals(
        guardian.parse(new Date('2020-02-29')),
        new Date('2020-02-29'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2021-06-15')),
        GuardianError,
      );
    });

    it('non-leap year validation', () => {
      const guardian = new DateGuardian().nonLeapYear();

      asserts.assertEquals(
        guardian.parse(new Date('2021-06-15')),
        new Date('2021-06-15'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2020-02-29')),
        GuardianError,
      );
    });

    it('weekdays validation', () => {
      const guardian = new DateGuardian().weekdays();

      // Monday (June 12, 2023)
      asserts.assertEquals(
        guardian.parse(new Date('2023-06-12')),
        new Date('2023-06-12'),
      );

      // Sunday (June 11, 2023)
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-06-11')),
        GuardianError,
      );
      // Saturday (June 10, 2023)
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-06-10')),
        GuardianError,
      );
    });

    it('weekends validation', () => {
      const guardian = new DateGuardian().weekends();

      // Sunday (June 11, 2023)
      asserts.assertEquals(
        guardian.parse(new Date('2023-06-11')),
        new Date('2023-06-11'),
      );
      // Saturday (June 10, 2023)
      asserts.assertEquals(
        guardian.parse(new Date('2023-06-10')),
        new Date('2023-06-10'),
      );

      // Monday (June 12, 2023)
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-06-12')),
        GuardianError,
      );
    });

    it('holiday validation', () => {
      const holidays = [new Date('2023-07-04'), new Date('2023-12-25')];
      const guardian = new DateGuardian().holiday(holidays);

      asserts.assertEquals(
        guardian.parse(new Date('2023-07-04')),
        new Date('2023-07-04'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-06-15')),
        GuardianError,
      );
    });

    it('not holiday validation', () => {
      const holidays = [new Date('2023-07-04'), new Date('2023-12-25')];
      const guardian = new DateGuardian().notHoliday(holidays);

      asserts.assertEquals(
        guardian.parse(new Date('2023-06-15')),
        new Date('2023-06-15'),
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('2023-07-04')),
        GuardianError,
      );
    });

    it('within validation', () => {
      const guardian = new DateGuardian().within(1, 'days');
      const now = new Date();

      // Should pass for current time
      asserts.assertEquals(guardian.parse(now), now);

      // Should fail for date more than 1 day away
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      asserts.assertThrows(() => guardian.parse(twoDaysAgo), GuardianError);
    });

    it('recent validation', () => {
      const guardian = new DateGuardian().recent(1, 'hours');
      const now = new Date();

      asserts.assertEquals(guardian.parse(now), now);

      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      asserts.assertThrows(() => guardian.parse(twoHoursAgo), GuardianError);
    });

    it('soon validation', () => {
      const guardian = new DateGuardian().soon(1, 'hours');
      const now = new Date();

      asserts.assertEquals(guardian.parse(now), now);

      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      asserts.assertThrows(
        () => guardian.parse(twoHoursFromNow),
        GuardianError,
      );
    });
  });

  describe('transformation methods', () => {
    it('add time', () => {
      const date = new Date('2023-06-15T10:30:00');

      const addedDays = new DateGuardian().add(5, 'days').parse(date);
      asserts.assertEquals(addedDays.getDate(), 20);

      const addedMonths = new DateGuardian().add(2, 'months').parse(date);
      asserts.assertEquals(addedMonths.getMonth(), 7); // August (0-indexed)

      const addedYears = new DateGuardian().add(1, 'years').parse(date);
      asserts.assertEquals(addedYears.getFullYear(), 2024);
    });

    it('add specific units', () => {
      const date = new Date('2023-06-15T10:30:00');

      const addedDays = new DateGuardian().addDays(10).parse(date);
      asserts.assertEquals(addedDays.getDate(), 25);

      const addedMonths = new DateGuardian().addMonths(3).parse(date);
      asserts.assertEquals(addedMonths.getMonth(), 8); // September (0-indexed)

      const addedYears = new DateGuardian().addYears(2).parse(date);
      asserts.assertEquals(addedYears.getFullYear(), 2025);
    });

    it('to timezone', () => {
      const date = new Date('2023-06-15T10:30:00');

      // Convert to different timezone (offset in minutes)
      const converted = new DateGuardian().toTimezone(-300).parse(date); // UTC-5
      asserts.assertInstanceOf(converted, Date);
    });

    it('to UTC', () => {
      const date = new Date('2023-06-15T10:30:00');

      const utcDate = new DateGuardian().toUTC().parse(date);
      asserts.assertInstanceOf(utcDate, Date);
    });

    it('format relative', () => {
      const now = new Date();

      // Test with a date 2 hours ago
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const relative = new DateGuardian().formatRelative().parse(twoHoursAgo);
      asserts.assertStringIncludes(relative, 'ago');
    });

    it('duration', () => {
      const now = new Date();

      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const duration = new DateGuardian().duration('hours').parse(oneHourAgo);
      asserts.assertEquals(duration, 1);
    });

    it('week number', () => {
      const date = new Date('2023-06-15');

      const weekNum = new DateGuardian().weekNumber().parse(date);
      asserts.assertEquals(typeof weekNum, 'number');
      asserts.assert(weekNum >= 1 && weekNum <= 53);
    });

    it('day of year', () => {
      const date = new Date('2023-01-01');

      const dayOfYear = new DateGuardian().dayOfYear().parse(date);
      asserts.assertEquals(dayOfYear, 1);

      const midYear = new Date('2023-07-01');
      const midDayOfYear = new DateGuardian().dayOfYear().parse(midYear);
      asserts.assert(midDayOfYear > 180);
    });

    it('diff', () => {
      const date1 = new Date('2023-06-15T10:00:00');
      const date2 = new Date('2023-06-15T12:00:00');

      const diffHours = new DateGuardian().diff(date1, 'hours').parse(date2);
      asserts.assertEquals(diffHours, 2);

      const diffDays = new DateGuardian().diff(new Date('2023-06-15'), 'days')
        .parse(new Date('2023-06-20'));
      asserts.assertEquals(diffDays, 5);
    });
  });

  describe('nullable and optional chaining', () => {
    it(
      'nullable().optional() allows null, undefined, and valid date',
      () => {
        const guard = new DateGuardian().nullable().optional();

        asserts.assertEquals(guard.parse(null), null);
        asserts.assertEquals(guard.parse(undefined), undefined);

        const testDate = new Date('2023-06-15');
        asserts.assertEquals(guard.parse(testDate), testDate);

        const anotherDate = new Date('2024-01-01');
        asserts.assertEquals(guard.parse(anotherDate), anotherDate);
      },
    );

    it(
      'optional().nullable() allows undefined, null, and valid date',
      () => {
        const guard = new DateGuardian().optional().nullable();

        asserts.assertEquals(guard.parse(undefined), undefined);
        asserts.assertEquals(guard.parse(null), null);

        const testDate = new Date('2023-06-15');
        asserts.assertEquals(guard.parse(testDate), testDate);

        const anotherDate = new Date('2024-01-01');
        asserts.assertEquals(guard.parse(anotherDate), anotherDate);
      },
    );

    it('nullable().optional() rejects invalid dates', () => {
      const guard = new DateGuardian().nullable().optional();

      // Numeric inputs and parseable strings are coerced — they're valid Dates.
      asserts.assertInstanceOf(guard.parse(123), Date);
      // Unparseable strings, non-Date objects, and explicit invalid Dates still throw.
      asserts.assertThrows(() => guard.parse('invalid-date'));
      asserts.assertThrows(() => guard.parse({}));
      asserts.assertThrows(() => guard.parse(new Date('invalid')));
    });

    it('optional().nullable() rejects invalid dates', () => {
      const guard = new DateGuardian().optional().nullable();

      asserts.assertInstanceOf(guard.parse(123), Date);
      asserts.assertThrows(() => guard.parse('invalid-date'));
      asserts.assertThrows(() => guard.parse({}));
      asserts.assertThrows(() => guard.parse(new Date('invalid')));
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Metadata and describe', () => {
    it('should set metadata via describe', () => {
      const guard = new DateGuardian().describe({
        title: 'Birthday',
        description: 'User birth date',
      });

      asserts.assertEquals(guard.metaData?.title, 'Birthday');
      asserts.assertEquals(guard.metaData?.description, 'User birth date');
    });

    it('should not override protected flags with describe', () => {
      const guard = new DateGuardian()
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any,
        });

      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across describe calls', () => {
      const guard = new DateGuardian();

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'Date field' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'Date field');
    });
  });

  describe('Extreme date values', () => {
    it('should handle very old dates', () => {
      const guard = new DateGuardian();
      const oldDate = new Date('1900-01-01');

      asserts.assertEquals(guard.parse(oldDate), oldDate);
    });

    it('should handle very future dates', () => {
      const guard = new DateGuardian();
      const futureDate = new Date('2100-12-31');

      asserts.assertEquals(guard.parse(futureDate), futureDate);
    });

    it('should handle epoch date', () => {
      const guard = new DateGuardian();
      const epoch = new Date(0);

      asserts.assertEquals(guard.parse(epoch), epoch);
    });

    it('should handle negative timestamps', () => {
      const guard = new DateGuardian();
      const preEpoch = new Date(-1000000);

      asserts.assertEquals(guard.parse(preEpoch), preEpoch);
    });

    it('should handle dates with milliseconds', () => {
      const guard = new DateGuardian();
      const precise = new Date('2023-06-15T12:34:56.789Z');

      asserts.assertEquals(guard.parse(precise), precise);
      asserts.assertEquals(guard.parse(precise).getMilliseconds(), 789);
    });
  });

  describe('Timezone handling', () => {
    it('should preserve timezone information', () => {
      const guard = new DateGuardian();
      const utcDate = new Date('2023-06-15T12:00:00Z');

      asserts.assertEquals(guard.parse(utcDate), utcDate);
    });

    it('should handle local time dates', () => {
      const guard = new DateGuardian();
      const localDate = new Date('2023-06-15T12:00:00');

      asserts.assertEquals(guard.parse(localDate), localDate);
    });

    it('should compare dates correctly regardless of timezone', () => {
      const minDate = new Date('2023-01-01T00:00:00Z');
      const guard = new DateGuardian().min(minDate);

      const testDate = new Date('2023-06-15T00:00:00Z');
      asserts.assertEquals(guard.parse(testDate), testDate);
    });
  });

  describe('Process and transformations', () => {
    it('should transform date to ISO string', () => {
      const guard = new DateGuardian().process((val) => val.toISOString());

      const testDate = new Date('2023-06-15T12:00:00Z');
      asserts.assertEquals(guard.parse(testDate), '2023-06-15T12:00:00.000Z');
    });

    it('should transform date to timestamp', () => {
      const guard = new DateGuardian().process((val) => val.getTime());

      const testDate = new Date('2023-06-15T12:00:00Z');
      asserts.assertEquals(guard.parse(testDate), testDate.getTime());
    });

    it('should chain multiple transformations', () => {
      const guard = new DateGuardian()
        .process((val) => new Date(val.getTime() + 86400000)) // +1 day
        .process((val) => val.toISOString().split('T')[0]); // date part only

      const testDate = new Date('2023-06-15T12:00:00Z');
      asserts.assertEquals(guard.parse(testDate), '2023-06-16');
    });

    it('should handle async transformations', async () => {
      const guard = new DateGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val.toISOString();
      });

      const testDate = new Date('2023-06-15T12:00:00Z');
      const result = await guard.parseAsync(testDate);
      asserts.assertEquals(result, '2023-06-15T12:00:00.000Z');
    });
  });

  describe('SafeParse comprehensive', () => {
    it('should handle safeParse with valid dates', () => {
      const guard = new DateGuardian();
      const testDate = new Date('2023-06-15');

      const [error, data] = guard.safeParse(testDate);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, testDate);
    });

    it('should handle safeParse with invalid dates', () => {
      const guard = new DateGuardian();

      const [error, data] = guard.safeParse(new Date('invalid'));
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle safeParse with constraints', () => {
      const minDate = new Date('2020-01-01');
      const guard = new DateGuardian().min(minDate);

      const [error1, data1] = guard.safeParse(new Date('2023-06-15'));
      asserts.assertEquals(error1, null);
      asserts.assert(data1 instanceof Date);

      const [error2, data2] = guard.safeParse(new Date('2010-01-01'));
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });

    it('should handle safeParse with transformations', () => {
      const guard = new DateGuardian().process((val) => val.toISOString());

      const testDate = new Date('2023-06-15T12:00:00Z');
      const [error, data] = guard.safeParse(testDate);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, '2023-06-15T12:00:00.000Z');
    });
  });

  describe('Error scenarios comprehensive', () => {
    it('should reject non-coercible types', () => {
      const guard = new DateGuardian();

      // Parseable date strings + ms timestamps coerce successfully.
      asserts.assertInstanceOf(guard.parse('2023-06-15'), Date);
      asserts.assertInstanceOf(guard.parse(1687000000000), Date);

      // Genuinely non-coercible inputs still throw.
      asserts.assertThrows(() => guard.parse(true), GuardianError);
      asserts.assertThrows(() => guard.parse({}), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
      asserts.assertThrows(() => guard.parse('not-a-date'), GuardianError);
    });

    it('should provide clear error messages for type errors', () => {
      const guard = new DateGuardian();

      try {
        guard.parse('not a date');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('Date') || error.message.includes('date'),
        );
      }
    });

    it('should provide clear error messages for range violations', () => {
      const minDate = new Date('2020-01-01');
      const guard = new DateGuardian().min(minDate);

      try {
        guard.parse(new Date('2010-01-01'));
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('2020') || error.message.includes('min'),
        );
      }
    });

    it('should reject invalid date objects', () => {
      const guard = new DateGuardian();
      const invalidDate = new Date('invalid string');

      asserts.assertThrows(() => guard.parse(invalidDate), GuardianError);
    });
  });

  describe('Async parseAsync comprehensive', () => {
    it('should handle parseAsync with sync operations', async () => {
      const guard = new DateGuardian();
      const testDate = new Date('2023-06-15');

      const result = await guard.parseAsync(testDate);
      asserts.assertEquals(result, testDate);
    });

    it('should handle parseAsync with async transformations', async () => {
      const guard = new DateGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val.getTime();
      });

      const testDate = new Date('2023-06-15T12:00:00Z');
      const result = await guard.parseAsync(testDate);
      asserts.assertEquals(result, testDate.getTime());
    });

    it('should handle parseAsync errors', async () => {
      const minDate = new Date('2020-01-01');
      const guard = new DateGuardian().min(minDate);

      let caught = false;
      try {
        await guard.parseAsync(new Date('2010-01-01'));
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('OpenAPI generation', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = new DateGuardian();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'date-time');
    });

    it('should include metadata in OpenAPI schema', () => {
      const guard = new DateGuardian().describe({
        title: 'Event Date',
        description: 'When the event happens',
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.title, 'Event Date');
      asserts.assertEquals(schema.description, 'When the event happens');
    });

    it('should handle nullable in OpenAPI', () => {
      const guard = new DateGuardian().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('Edge cases with past/future validations', () => {
    it('should validate past dates', () => {
      const guard = new DateGuardian().past();
      const yesterday = new Date(Date.now() - 86400000);

      asserts.assertEquals(
        guard.parse(yesterday).getTime(),
        yesterday.getTime(),
      );

      const tomorrow = new Date(Date.now() + 86400000);
      asserts.assertThrows(() => guard.parse(tomorrow), GuardianError);
    });

    it('should validate future dates', () => {
      const guard = new DateGuardian().future();
      const tomorrow = new Date(Date.now() + 86400000);

      asserts.assertEquals(guard.parse(tomorrow).getTime(), tomorrow.getTime());

      const yesterday = new Date(Date.now() - 86400000);
      asserts.assertThrows(() => guard.parse(yesterday), GuardianError);
    });

    it('should handle edge case around current time', () => {
      // Create a date that's very close to now
      const almostNow = new Date(Date.now() - 100);

      const pastGuard = new DateGuardian().past();
      asserts.assertEquals(
        pastGuard.parse(almostNow).getTime(),
        almostNow.getTime(),
      );
    });
  });
});
