import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { DateGuardian } from '../../guards/mod.ts';

Deno.test('DateGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through Date objects', () => {
      const guard = DateGuardian.create();
      const date = new Date('2023-01-01');
      assertEquals(guard(date).getTime(), date.getTime());
    });

    await t.step('coerces valid date strings', () => {
      const guard = DateGuardian.create();
      const dateStr = '2023-01-01';
      const date = new Date(dateStr);
      assertEquals(guard(dateStr).getTime(), date.getTime());
    });

    await t.step('coerces valid timestamps', () => {
      const guard = DateGuardian.create();
      const timestamp = 1672531200000; // 2023-01-01
      const date = new Date(timestamp);
      assertEquals(guard(timestamp).getTime(), date.getTime());
    });

    await t.step('throws for invalid date values', () => {
      const guard = DateGuardian.create();
      assertThrows(() => guard('not a date'), GuardianError);
      assertThrows(() => guard('2023-13-01'), GuardianError); // Invalid month
      assertThrows(() => guard({}), GuardianError);
      assertThrows(() => guard([]), GuardianError);
      assertThrows(() => guard(null), GuardianError);
      assertThrows(() => guard(undefined), GuardianError);
    });

    await t.step('uses custom error message when provided', () => {
      const guard = DateGuardian.create('Custom error');
      assertThrows(() => guard('not a date'), GuardianError, 'Custom error');
    });
  });

  // Transformation tests
  await t.step('transformations', async (t) => {
    await t.step('format', () => {
      const guard = DateGuardian.create().format('yyyy-MM-dd');
      assertEquals(guard(new Date('2023-01-01')), '2023-01-01');
    });

    await t.step('iso', () => {
      const guard = DateGuardian.create().iso();
      const result = guard(new Date('2023-01-01'));
      assertEquals(result.includes('2023-01-01T'), true);
    });

    await t.step('UTC', () => {
      const guard = DateGuardian.create().UTC();
      const result = guard(new Date('2023-01-01'));
      assertEquals(result.includes('Sun, 01 Jan 2023'), true);
    });

    await t.step('startOfDay', () => {
      const guard = DateGuardian.create().startOfDay();
      const result = guard(new Date('2023-01-01T12:30:45'));
      assertEquals(result.getHours(), 0);
      assertEquals(result.getMinutes(), 0);
      assertEquals(result.getSeconds(), 0);
      assertEquals(result.getMilliseconds(), 0);
    });

    await t.step('endOfDay', () => {
      const guard = DateGuardian.create().endOfDay();
      const result = guard(new Date('2023-01-01T12:30:45'));
      assertEquals(result.getHours(), 23);
      assertEquals(result.getMinutes(), 59);
      assertEquals(result.getSeconds(), 59);
      assertEquals(result.getMilliseconds(), 999);
    });

    await t.step('startOfMonth', () => {
      const guard = DateGuardian.create().startOfMonth();
      const result = guard(new Date('2023-01-15T12:30:45'));
      assertEquals(result.getFullYear(), 2023);
      assertEquals(result.getMonth(), 0); // January is 0
      assertEquals(result.getDate(), 1);
      assertEquals(result.getHours(), 0);
      assertEquals(result.getMinutes(), 0);
      assertEquals(result.getSeconds(), 0);
      assertEquals(result.getMilliseconds(), 0);
    });

    await t.step('endOfMonth', () => {
      const guard = DateGuardian.create().endOfMonth();
      const result = guard(new Date('2023-01-15T12:30:45'));
      assertEquals(result.getFullYear(), 2023);
      assertEquals(result.getMonth(), 0); // January is 0
      assertEquals(result.getDate(), 31); // January has 31 days
      assertEquals(result.getHours(), 23);
      assertEquals(result.getMinutes(), 59);
      assertEquals(result.getSeconds(), 59);
      assertEquals(result.getMilliseconds(), 999);
    });

    await t.step('startOfYear', () => {
      const guard = DateGuardian.create().startOfYear();
      const result = guard(new Date('2023-06-15T12:30:45'));
      assertEquals(result.getFullYear(), 2023);
      assertEquals(result.getMonth(), 0); // January is 0
      assertEquals(result.getDate(), 1);
      assertEquals(result.getHours(), 0);
      assertEquals(result.getMinutes(), 0);
      assertEquals(result.getSeconds(), 0);
      assertEquals(result.getMilliseconds(), 0);
    });

    await t.step('endOfYear', () => {
      const guard = DateGuardian.create().endOfYear();
      const result = guard(new Date('2023-06-15T12:30:45'));
      assertEquals(result.getFullYear(), 2023);
      assertEquals(result.getMonth(), 11); // December is 11
      assertEquals(result.getDate(), 31);
      assertEquals(result.getHours(), 23);
      assertEquals(result.getMinutes(), 59);
      assertEquals(result.getSeconds(), 59);
      assertEquals(result.getMilliseconds(), 999);
    });

    await t.step('add', () => {
      const date = new Date(Date.UTC(2023, 0, 1, 0, 0, 0));
      assertEquals(
        DateGuardian.create().add(1, 'years')(date).getFullYear(),
        2024,
      );
      assertEquals(
        DateGuardian.create().add(1, 'months')(date).getMonth(),
        1, // February is 1
      );
      assertEquals(
        DateGuardian.create().add(1, 'days')(date).getDate(),
        2,
      );
      assertEquals(
        DateGuardian.create().add(1, 'hours')(date).getUTCHours(),
        1,
      );
      assertEquals(
        DateGuardian.create().add(1, 'minutes')(date).getUTCMinutes(),
        1,
      );
      assertEquals(
        DateGuardian.create().add(1, 'seconds')(date).getSeconds(),
        1,
      );
      assertEquals(
        DateGuardian.create().add(1, 'milliseconds')(date).getMilliseconds(),
        1,
      );
    });

    await t.step('subtract', () => {
      const date = new Date('2023-01-01');

      assertEquals(
        DateGuardian.create().subtract(1, 'years')(date).getFullYear(),
        2022,
      );
      assertEquals(
        DateGuardian.create().subtract(1, 'months')(date).getMonth(),
        11, // December is 11
      );
    });

    await t.step('toTimestamp', () => {
      const date = new Date('2023-01-01');
      const timestamp = date.getTime();
      const result = DateGuardian.create().toTimestamp()(date);
      assertEquals(result, timestamp);
    });

    await t.step('toISODate', () => {
      const result = DateGuardian.create().toISODate()(
        new Date('2023-01-01T12:30:45'),
      );
      assertEquals(result, '2023-01-01');
    });

    await t.step('age', () => {
      // This test is time-dependent, so may need adjustment
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 25); // 25 years ago

      const result = DateGuardian.create().age()(birthDate);
      assertEquals(result, 25);
    });

    await t.step('chaining transformations', () => {
      const guard = DateGuardian.create()
        .startOfMonth()
        .add(2, 'days')
        .format('yyyy-MM-dd');

      assertEquals(guard(new Date('2023-01-15')), '2023-01-03');
    });
  });

  // Validation tests
  await t.step('validations', async (t) => {
    await t.step('min', async (t) => {
      const minDate = new Date('2023-01-01');

      await t.step('passes when date is at or after min date', () => {
        const guard = DateGuardian.create().min(minDate);
        assertEquals(
          guard(new Date('2023-01-01')).getTime(),
          minDate.getTime(),
        );
        assertEquals(
          guard(new Date('2023-01-02')).getTime(),
          new Date('2023-01-02').getTime(),
        );
      });

      await t.step('throws when date is before min date', () => {
        const guard = DateGuardian.create().min(minDate);
        assertThrows(() => guard(new Date('2022-12-31')), Error);
      });
    });

    await t.step('max', async (t) => {
      const maxDate = new Date('2023-01-31');

      await t.step('passes when date is at or before max date', () => {
        const guard = DateGuardian.create().max(maxDate);
        assertEquals(
          guard(new Date('2023-01-31')).getTime(),
          maxDate.getTime(),
        );
        assertEquals(
          guard(new Date('2023-01-30')).getTime(),
          new Date('2023-01-30').getTime(),
        );
      });

      await t.step('throws when date is after max date', () => {
        const guard = DateGuardian.create().max(maxDate);
        assertThrows(() => guard(new Date('2023-02-01')), Error);
      });
    });

    await t.step('range', async (t) => {
      const minDate = new Date('2023-01-01');
      const maxDate = new Date('2023-01-31');

      await t.step('passes when date is within range', () => {
        const guard = DateGuardian.create().range(minDate, maxDate);
        assertEquals(
          guard(new Date('2023-01-01')).getTime(),
          minDate.getTime(),
        );
        assertEquals(
          guard(new Date('2023-01-15')).getTime(),
          new Date('2023-01-15').getTime(),
        );
        assertEquals(
          guard(new Date('2023-01-31')).getTime(),
          maxDate.getTime(),
        );
      });

      await t.step('throws when date is outside range', () => {
        const guard = DateGuardian.create().range(minDate, maxDate);
        assertThrows(() => guard(new Date('2022-12-31')), Error);
        assertThrows(() => guard(new Date('2023-02-01')), Error);
      });
    });

    await t.step('future', async (t) => {
      await t.step('passes when date is in the future', () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

        const guard = DateGuardian.create().future();
        assertEquals(guard(futureDate).getTime(), futureDate.getTime());
      });

      await t.step('throws when date is not in the future', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1); // Yesterday

        const guard = DateGuardian.create().future();
        assertThrows(() => guard(pastDate), Error);
      });
    });

    await t.step('past', async (t) => {
      await t.step('passes when date is in the past', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1); // Yesterday

        const guard = DateGuardian.create().past();
        assertEquals(guard(pastDate).getTime(), pastDate.getTime());
      });

      await t.step('throws when date is not in the past', () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

        const guard = DateGuardian.create().past();
        assertThrows(() => guard(futureDate), Error);
      });
    });

    await t.step('weekday and weekend', async (t) => {
      // These tests assume we have specific dates we know are weekdays/weekends
      const weekdayDate = new Date('2023-01-02'); // Monday
      const weekendDate = new Date('2023-01-01'); // Sunday

      await t.step('weekday passes for weekday dates', () => {
        const guard = DateGuardian.create().weekday();
        assertEquals(guard(weekdayDate).getTime(), weekdayDate.getTime());
      });

      await t.step('weekday throws for weekend dates', () => {
        const guard = DateGuardian.create().weekday();
        assertThrows(() => guard(weekendDate), Error);
      });

      await t.step('weekend passes for weekend dates', () => {
        const guard = DateGuardian.create().weekend();
        assertEquals(guard(weekendDate).getTime(), weekendDate.getTime());
      });

      await t.step('weekend throws for weekday dates', () => {
        const guard = DateGuardian.create().weekend();
        assertThrows(() => guard(weekdayDate), Error);
      });
    });

    await t.step('sameDay, sameMonth, sameYear', async (t) => {
      const referenceDate = new Date('2023-01-15');

      await t.step('sameDay tests', () => {
        const sameDay = new Date('2023-01-15T12:30:45');
        const differentDay = new Date('2023-01-16');

        const guard = DateGuardian.create().sameDay(referenceDate);
        assertEquals(guard(sameDay).getTime(), sameDay.getTime());
        assertThrows(() => guard(differentDay), Error);
      });

      await t.step('sameMonth tests', () => {
        const sameMonth = new Date('2023-01-20');
        const differentMonth = new Date('2023-02-15');

        const guard = DateGuardian.create().sameMonth(referenceDate);
        assertEquals(guard(sameMonth).getTime(), sameMonth.getTime());
        assertThrows(() => guard(differentMonth), Error);
      });

      await t.step('sameYear tests', () => {
        const sameYear = new Date('2023-06-15');
        const differentYear = new Date('2022-01-15');

        const guard = DateGuardian.create().sameYear(referenceDate);
        assertEquals(guard(sameYear).getTime(), sameYear.getTime());
        assertThrows(() => guard(differentYear), Error);
      });
    });

    await t.step('isBefore and isAfter', async (t) => {
      const referenceDate = new Date('2023-01-15');

      await t.step('isBefore tests', () => {
        const beforeDate = new Date('2023-01-14');
        const afterDate = new Date('2023-01-16');
        const sameDate = new Date('2023-01-15');

        const guard = DateGuardian.create().isBefore(referenceDate);
        assertEquals(guard(beforeDate).getTime(), beforeDate.getTime());
        assertThrows(() => guard(afterDate), Error);
        assertThrows(() => guard(sameDate), Error);
      });

      await t.step('isAfter tests', () => {
        const afterDate = new Date('2023-01-16');
        const beforeDate = new Date('2023-01-14');
        const sameDate = new Date('2023-01-15');

        const guard = DateGuardian.create().isAfter(referenceDate);
        assertEquals(guard(afterDate).getTime(), afterDate.getTime());
        assertThrows(() => guard(beforeDate), Error);
        assertThrows(() => guard(sameDate), Error);
      });
    });

    await t.step('chaining validations', () => {
      const start = new Date('2023-01-01');
      const end = new Date('2023-01-31');

      const guard = DateGuardian.create()
        .range(start, end)
        .weekday();

      assertEquals(
        guard(new Date('2023-01-02')).getTime(),
        new Date('2023-01-02').getTime(),
      ); // Monday
      assertThrows(() => guard(new Date('2022-12-15')), Error); // Outside range
      assertThrows(() => guard(new Date('2023-01-07')), Error); // Saturday
    });
  });
});
