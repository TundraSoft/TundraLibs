import * as asserts from '$asserts';
import { DateGuardian, GuardianError } from '../../mod.ts';

Deno.test('guardian.DateGuardian', async (t) => {
  await t.step('basic functionality', async (t) => {
    await t.step('should validate date type', () => {
      const guardian = new DateGuardian();
      const date = new Date('2023-06-15');

      asserts.assertEquals(guardian.parse(date), date);

      asserts.assertThrows(() => guardian.parse('2023-06-15'), GuardianError);
      asserts.assertThrows(() => guardian.parse(1687000000000), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
    });

    await t.step('should reject invalid dates', () => {
      const guardian = new DateGuardian();
      const invalidDate = new Date('invalid');

      asserts.assertThrows(() => guardian.parse(invalidDate), GuardianError);
    });

    await t.step('should preserve valid dates', () => {
      const guardian = new DateGuardian();
      const date = new Date('2023-06-15T14:30:00');

      asserts.assertEquals(guardian.parse(date), date);
    });
  });

  await t.step('range validations', async (t) => {
    await t.step('should validate minimum date', () => {
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

    await t.step('should validate maximum date', () => {
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

    await t.step('should combine min and max dates', () => {
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

    await t.step('should validate past dates', () => {
      const guardian = new DateGuardian().past();
      const pastDate = new Date('2020-01-01');

      asserts.assertEquals(guardian.parse(pastDate), pastDate);

      // Future date should fail
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      asserts.assertThrows(() => guardian.parse(futureDate), GuardianError);
    });

    await t.step('should validate future dates', () => {
      const guardian = new DateGuardian().future();
      const futureDate = new Date(Date.now() + 86400000); // tomorrow

      asserts.assertEquals(guardian.parse(futureDate), futureDate);

      // Past date should fail
      const pastDate = new Date('2020-01-01');
      asserts.assertThrows(() => guardian.parse(pastDate), GuardianError);
    });
  });

  await t.step('date-specific validations', async (t) => {
    await t.step('should validate weekday', () => {
      const monday = new Date('2023-06-12'); // Monday
      const tuesday = new Date('2023-06-13'); // Tuesday

      const mondayGuardian = new DateGuardian().weekday(1); // Monday

      asserts.assertEquals(mondayGuardian.parse(monday), monday);
      asserts.assertThrows(() => mondayGuardian.parse(tuesday), GuardianError);
    });

    await t.step('should validate business hours', () => {
      const businessHour = new Date('2023-06-15T14:00:00'); // 2 PM
      const afterHours = new Date('2023-06-15T20:00:00'); // 8 PM

      const guardian = new DateGuardian().businessHours();

      asserts.assertEquals(guardian.parse(businessHour), businessHour);
      asserts.assertThrows(() => guardian.parse(afterHours), GuardianError);
    });
  });

  await t.step('transformations', async (t) => {
    await t.step('should format dates', () => {
      const guardian = new DateGuardian().format('yyyy-MM-dd');
      const date = new Date('2023-06-15T14:30:00');

      asserts.assertEquals(guardian.parse(date), '2023-06-15');
    });

    await t.step('should format time', () => {
      const guardian = new DateGuardian().format('HH:mm:ss');
      const date = new Date('2023-06-15T14:30:45');

      asserts.assertEquals(guardian.parse(date), '14:30:45');
    });

    await t.step('should format full datetime', () => {
      const guardian = new DateGuardian().format('yyyy-MM-dd HH:mm:ss');
      const date = new Date('2023-06-15T14:30:45');

      asserts.assertEquals(guardian.parse(date), '2023-06-15 14:30:45');
    });

    await t.step('should convert to ISO string', () => {
      const guardian = new DateGuardian().toISOString();
      const date = new Date('2023-06-15T14:30:00Z');

      asserts.assertEquals(guardian.parse(date), '2023-06-15T14:30:00.000Z');
    });

    await t.step('should convert to timestamp', () => {
      const guardian = new DateGuardian().toTimestamp();
      const date = new Date('2023-06-15T14:30:00Z');

      asserts.assertEquals(guardian.parse(date), date.getTime());
    });

    await t.step('should convert to unix timestamp', () => {
      const guardian = new DateGuardian().toUnixTimestamp();
      const date = new Date('2023-06-15T14:30:00Z');

      asserts.assertEquals(
        guardian.parse(date),
        Math.floor(date.getTime() / 1000),
      );
    });

    await t.step('should extract date components', () => {
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
  });

  await t.step('chained validations', async (t) => {
    await t.step('should chain date validations', () => {
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

    await t.step('should chain validations and transformations', () => {
      const guardian = new DateGuardian()
        .past()
        .format('yyyy-MM-dd');

      const pastDate = new Date('2020-06-15');
      asserts.assertEquals(guardian.parse(pastDate), '2020-06-15');
    });
  });

  await t.step('safe parsing', async (t) => {
    await t.step('should return success result for valid input', () => {
      const guardian = new DateGuardian();
      const date = new Date('2023-06-15');
      const [error, result] = guardian.safeParse(date);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, date);
    });

    await t.step('should return error result for invalid input', () => {
      const guardian = new DateGuardian();
      const [error, result] = guardian.safeParse('2023-06-15');

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step('error handling', async (t) => {
    await t.step('should provide detailed error messages', () => {
      const guardian = new DateGuardian();

      asserts.assertThrows(
        () => guardian.parse('2023-06-15'),
        GuardianError,
        'Expected Date but got string',
      );
      asserts.assertThrows(
        () => guardian.parse(new Date('invalid')),
        GuardianError,
        'Date is invalid',
      );
    });

    await t.step('should support custom error messages', () => {
      const guardian = new DateGuardian().past('Date must be in the past');
      const futureDate = new Date(Date.now() + 86400000);

      asserts.assertThrows(
        () => guardian.parse(futureDate),
        GuardianError,
        'Date must be in the past',
      );
    });
  });

  await t.step('real world usage', async (t) => {
    await t.step('should validate birth date', () => {
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

    await t.step('should validate appointment scheduling', () => {
      const guardian = new DateGuardian()
        .future()
        .weekday(1) // Monday only
        .businessHours();

      // Create a future Monday at 2 PM
      const futureMonday = new Date();
      futureMonday.setDate(
        futureMonday.getDate() + (1 + 7 - futureMonday.getDay()) % 7,
      ); // Next Monday
      futureMonday.setHours(14, 0, 0, 0); // 2 PM

      asserts.assertEquals(guardian.parse(futureMonday), futureMonday);
    });
  });
});
