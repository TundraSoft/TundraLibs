import * as asserts from "$asserts";
import { DateGuardian, GuardianError } from "../../mod.ts";

Deno.test("guardian.DateGuardian", async (t) => {
  await t.step("basic functionality", async (t) => {
    await t.step("should validate date type", () => {
      const guardian = new DateGuardian();
      const date = new Date("2023-06-15");

      asserts.assertEquals(guardian.parse(date), date);

      asserts.assertThrows(() => guardian.parse("2023-06-15"), GuardianError);
      asserts.assertThrows(() => guardian.parse(1687000000000), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
    });

    await t.step("should reject invalid dates", () => {
      const guardian = new DateGuardian();
      const invalidDate = new Date("invalid");

      asserts.assertThrows(() => guardian.parse(invalidDate), GuardianError);
    });

    await t.step("should preserve valid dates", () => {
      const guardian = new DateGuardian();
      const date = new Date("2023-06-15T14:30:00");

      asserts.assertEquals(guardian.parse(date), date);
    });
  });

  await t.step("range validations", async (t) => {
    await t.step("should validate minimum date", () => {
      const minDate = new Date("2020-01-01");
      const guardian = new DateGuardian().min(minDate);

      asserts.assertEquals(
        guardian.parse(new Date("2020-01-01")),
        new Date("2020-01-01"),
      );
      asserts.assertEquals(
        guardian.parse(new Date("2023-06-15")),
        new Date("2023-06-15"),
      );

      asserts.assertThrows(
        () => guardian.parse(new Date("2019-12-31")),
        GuardianError,
      );
    });

    await t.step("should validate maximum date", () => {
      const maxDate = new Date("2030-12-31");
      const guardian = new DateGuardian().max(maxDate);

      asserts.assertEquals(
        guardian.parse(new Date("2030-12-31")),
        new Date("2030-12-31"),
      );
      asserts.assertEquals(
        guardian.parse(new Date("2023-06-15")),
        new Date("2023-06-15"),
      );

      asserts.assertThrows(
        () => guardian.parse(new Date("2031-01-01")),
        GuardianError,
      );
    });

    await t.step("should combine min and max dates", () => {
      const guardian = new DateGuardian()
        .min(new Date("2020-01-01"))
        .max(new Date("2030-12-31"));

      asserts.assertEquals(
        guardian.parse(new Date("2023-06-15")),
        new Date("2023-06-15"),
      );

      asserts.assertThrows(
        () => guardian.parse(new Date("2019-12-31")),
        GuardianError,
      );
      asserts.assertThrows(
        () => guardian.parse(new Date("2031-01-01")),
        GuardianError,
      );
    });

    await t.step("should validate past dates", () => {
      const guardian = new DateGuardian().past();
      const pastDate = new Date("2020-01-01");

      asserts.assertEquals(guardian.parse(pastDate), pastDate);

      // Future date should fail
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      asserts.assertThrows(() => guardian.parse(futureDate), GuardianError);
    });

    await t.step("should validate future dates", () => {
      const guardian = new DateGuardian().future();
      const futureDate = new Date(Date.now() + 86400000); // tomorrow

      asserts.assertEquals(guardian.parse(futureDate), futureDate);

      // Past date should fail
      const pastDate = new Date("2020-01-01");
      asserts.assertThrows(() => guardian.parse(pastDate), GuardianError);
    });
  });

  await t.step("date-specific validations", async (t) => {
    await t.step("should validate weekday", () => {
      const monday = new Date("2023-06-12"); // Monday
      const tuesday = new Date("2023-06-13"); // Tuesday

      const mondayGuardian = new DateGuardian().weekday(1); // Monday

      asserts.assertEquals(mondayGuardian.parse(monday), monday);
      asserts.assertThrows(() => mondayGuardian.parse(tuesday), GuardianError);
    });

    await t.step("should validate business hours", () => {
      const businessHour = new Date("2023-06-15T14:00:00"); // 2 PM
      const afterHours = new Date("2023-06-15T20:00:00"); // 8 PM

      const guardian = new DateGuardian().businessHours();

      asserts.assertEquals(guardian.parse(businessHour), businessHour);
      asserts.assertThrows(() => guardian.parse(afterHours), GuardianError);
    });
  });

  await t.step("transformations", async (t) => {
    await t.step("should format dates", () => {
      const guardian = new DateGuardian().format("yyyy-MM-dd");
      const date = new Date("2023-06-15T14:30:00");

      asserts.assertEquals(guardian.parse(date), "2023-06-15");
    });

    await t.step("should format time", () => {
      const guardian = new DateGuardian().format("HH:mm:ss");
      const date = new Date("2023-06-15T14:30:45");

      asserts.assertEquals(guardian.parse(date), "14:30:45");
    });

    await t.step("should format full datetime", () => {
      const guardian = new DateGuardian().format("yyyy-MM-dd HH:mm:ss");
      const date = new Date("2023-06-15T14:30:45");

      asserts.assertEquals(guardian.parse(date), "2023-06-15 14:30:45");
    });

    await t.step("should convert to ISO string", () => {
      const guardian = new DateGuardian().toISOString();
      const date = new Date("2023-06-15T14:30:00Z");

      asserts.assertEquals(guardian.parse(date), "2023-06-15T14:30:00.000Z");
    });

    await t.step("should convert to timestamp", () => {
      const guardian = new DateGuardian().toTimestamp();
      const date = new Date("2023-06-15T14:30:00Z");

      asserts.assertEquals(guardian.parse(date), date.getTime());
    });

    await t.step("should convert to unix timestamp", () => {
      const guardian = new DateGuardian().toUnixTimestamp();
      const date = new Date("2023-06-15T14:30:00Z");

      asserts.assertEquals(
        guardian.parse(date),
        Math.floor(date.getTime() / 1000),
      );
    });

    await t.step("should extract date components", () => {
      const date = new Date("2023-06-15T14:30:45");

      const yearGuardian = new DateGuardian().component("year");
      asserts.assertEquals(yearGuardian.parse(date), 2023);

      const monthGuardian = new DateGuardian().component("month");
      asserts.assertEquals(monthGuardian.parse(date), 6); // 1-based month

      const dayGuardian = new DateGuardian().component("day");
      asserts.assertEquals(dayGuardian.parse(date), 15);

      const hourGuardian = new DateGuardian().component("hour");
      asserts.assertEquals(hourGuardian.parse(date), 14);

      const minuteGuardian = new DateGuardian().component("minute");
      asserts.assertEquals(minuteGuardian.parse(date), 30);

      const secondGuardian = new DateGuardian().component("second");
      asserts.assertEquals(secondGuardian.parse(date), 45);
    });
  });

  await t.step("chained validations", async (t) => {
    await t.step("should chain date validations", () => {
      const guardian = new DateGuardian()
        .min(new Date("2020-01-01"))
        .max(new Date("2030-12-31"))
        .past();

      const validDate = new Date("2022-06-15");
      asserts.assertEquals(guardian.parse(validDate), validDate);

      // Too early
      asserts.assertThrows(
        () => guardian.parse(new Date("2019-01-01")),
        GuardianError,
      );

      // Too late
      asserts.assertThrows(
        () => guardian.parse(new Date("2031-01-01")),
        GuardianError,
      );
    });

    await t.step("should chain validations and transformations", () => {
      const guardian = new DateGuardian()
        .past()
        .format("yyyy-MM-dd");

      const pastDate = new Date("2020-06-15");
      asserts.assertEquals(guardian.parse(pastDate), "2020-06-15");
    });
  });

  await t.step("safe parsing", async (t) => {
    await t.step("should return success result for valid input", () => {
      const guardian = new DateGuardian();
      const date = new Date("2023-06-15");
      const [error, result] = guardian.safeParse(date);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, date);
    });

    await t.step("should return error result for invalid input", () => {
      const guardian = new DateGuardian();
      const [error, result] = guardian.safeParse("2023-06-15");

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step("error handling", async (t) => {
    await t.step("should provide detailed error messages", () => {
      const guardian = new DateGuardian();

      asserts.assertThrows(
        () => guardian.parse("2023-06-15"),
        GuardianError,
        "Expected Date but got string",
      );
      asserts.assertThrows(
        () => guardian.parse(new Date("invalid")),
        GuardianError,
        "Date is invalid",
      );
    });

    await t.step("should support custom error messages", () => {
      const guardian = new DateGuardian().past("Date must be in the past");
      const futureDate = new Date(Date.now() + 86400000);

      asserts.assertThrows(
        () => guardian.parse(futureDate),
        GuardianError,
        "Date must be in the past",
      );
    });
  });

  await t.step("real world usage", async (t) => {
    await t.step("should validate birth date", () => {
      const guardian = new DateGuardian()
        .min(new Date("1900-01-01"))
        .max(new Date("2010-12-31"))
        .past();

      const validBirthDate = new Date("1990-05-15");
      asserts.assertEquals(guardian.parse(validBirthDate), validBirthDate);

      // Too old
      asserts.assertThrows(
        () => guardian.parse(new Date("1899-12-31")),
        GuardianError,
      );

      // Too recent
      asserts.assertThrows(
        () => guardian.parse(new Date("2011-01-01")),
        GuardianError,
      );
    });

    await t.step("should validate appointment scheduling", () => {
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

  await t.step("new validation methods", async (t) => {
    await t.step("between validation", () => {
      const start = new Date("2020-01-01");
      const end = new Date("2025-12-31");
      const guardian = new DateGuardian().between(start, end);

      asserts.assertEquals(guardian.parse(new Date("2023-06-15")), new Date("2023-06-15"));
      asserts.assertEquals(guardian.parse(start), start);
      asserts.assertEquals(guardian.parse(end), end);

      asserts.assertThrows(() => guardian.parse(new Date("2019-12-31")), GuardianError);
      asserts.assertThrows(() => guardian.parse(new Date("2026-01-01")), GuardianError);
    });

    await t.step("age validation", () => {
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate());
      const guardian = new DateGuardian().age(25);

      asserts.assertEquals(guardian.parse(birthDate), birthDate);

      const wrongAge = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
      asserts.assertThrows(() => guardian.parse(wrongAge), GuardianError);
    });

    await t.step("age range validation", () => {
      const today = new Date();
      const validAge = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
      const guardian = new DateGuardian().ageRange(18, 65);

      asserts.assertEquals(guardian.parse(validAge), validAge);

      const tooYoung = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate());
      const tooOld = new Date(today.getFullYear() - 70, today.getMonth(), today.getDate());
      
      asserts.assertThrows(() => guardian.parse(tooYoung), GuardianError);
      asserts.assertThrows(() => guardian.parse(tooOld), GuardianError);
    });

    await t.step("year range validation", () => {
      const guardian = new DateGuardian().yearRange(2020, 2025);

      asserts.assertEquals(guardian.parse(new Date("2023-06-15")), new Date("2023-06-15"));
      asserts.assertThrows(() => guardian.parse(new Date("2019-12-31")), GuardianError);
      asserts.assertThrows(() => guardian.parse(new Date("2026-01-01")), GuardianError);
    });

    await t.step("month range validation", () => {
      const guardian = new DateGuardian().monthRange(6, 8); // June to August

      asserts.assertEquals(guardian.parse(new Date("2023-07-15")), new Date("2023-07-15"));
      asserts.assertThrows(() => guardian.parse(new Date("2023-05-15")), GuardianError);
      asserts.assertThrows(() => guardian.parse(new Date("2023-09-15")), GuardianError);
    });

    await t.step("day range validation", () => {
      const guardian = new DateGuardian().dayRange(15, 25);

      asserts.assertEquals(guardian.parse(new Date("2023-06-20")), new Date("2023-06-20"));
      asserts.assertThrows(() => guardian.parse(new Date("2023-06-10")), GuardianError);
      asserts.assertThrows(() => guardian.parse(new Date("2023-06-30")), GuardianError);
    });

    await t.step("quarter validation", () => {
      const guardian = new DateGuardian().quarter(2); // Q2: April-June

      asserts.assertEquals(guardian.parse(new Date("2023-05-15")), new Date("2023-05-15"));
      asserts.assertThrows(() => guardian.parse(new Date("2023-03-15")), GuardianError);
      asserts.assertThrows(() => guardian.parse(new Date("2023-07-15")), GuardianError);
    });

    await t.step("leap year validation", () => {
      const guardian = new DateGuardian().leapYear();

      asserts.assertEquals(guardian.parse(new Date("2020-02-29")), new Date("2020-02-29"));
      asserts.assertThrows(() => guardian.parse(new Date("2021-06-15")), GuardianError);
    });

    await t.step("non-leap year validation", () => {
      const guardian = new DateGuardian().nonLeapYear();

      asserts.assertEquals(guardian.parse(new Date("2021-06-15")), new Date("2021-06-15"));
      asserts.assertThrows(() => guardian.parse(new Date("2020-02-29")), GuardianError);
    });

    await t.step("weekdays validation", () => {
      const guardian = new DateGuardian().weekdays();

      // Monday (June 12, 2023)
      asserts.assertEquals(guardian.parse(new Date("2023-06-12")), new Date("2023-06-12"));
      
      // Sunday (June 11, 2023)
      asserts.assertThrows(() => guardian.parse(new Date("2023-06-11")), GuardianError);
      // Saturday (June 10, 2023)
      asserts.assertThrows(() => guardian.parse(new Date("2023-06-10")), GuardianError);
    });

    await t.step("weekends validation", () => {
      const guardian = new DateGuardian().weekends();

      // Sunday (June 11, 2023)
      asserts.assertEquals(guardian.parse(new Date("2023-06-11")), new Date("2023-06-11"));
      // Saturday (June 10, 2023)
      asserts.assertEquals(guardian.parse(new Date("2023-06-10")), new Date("2023-06-10"));
      
      // Monday (June 12, 2023)
      asserts.assertThrows(() => guardian.parse(new Date("2023-06-12")), GuardianError);
    });

    await t.step("holiday validation", () => {
      const holidays = [new Date("2023-07-04"), new Date("2023-12-25")];
      const guardian = new DateGuardian().holiday(holidays);

      asserts.assertEquals(guardian.parse(new Date("2023-07-04")), new Date("2023-07-04"));
      asserts.assertThrows(() => guardian.parse(new Date("2023-06-15")), GuardianError);
    });

    await t.step("not holiday validation", () => {
      const holidays = [new Date("2023-07-04"), new Date("2023-12-25")];
      const guardian = new DateGuardian().notHoliday(holidays);

      asserts.assertEquals(guardian.parse(new Date("2023-06-15")), new Date("2023-06-15"));
      asserts.assertThrows(() => guardian.parse(new Date("2023-07-04")), GuardianError);
    });

    await t.step("within validation", () => {
      const guardian = new DateGuardian().within(1, 'days');
      const now = new Date();

      // Should pass for current time
      asserts.assertEquals(guardian.parse(now), now);

      // Should fail for date more than 1 day away
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      asserts.assertThrows(() => guardian.parse(twoDaysAgo), GuardianError);
    });

    await t.step("recent validation", () => {
      const guardian = new DateGuardian().recent(1, 'hours');
      const now = new Date();

      asserts.assertEquals(guardian.parse(now), now);

      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      asserts.assertThrows(() => guardian.parse(twoHoursAgo), GuardianError);
    });

    await t.step("soon validation", () => {
      const guardian = new DateGuardian().soon(1, 'hours');
      const now = new Date();

      asserts.assertEquals(guardian.parse(now), now);

      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      asserts.assertThrows(() => guardian.parse(twoHoursFromNow), GuardianError);
    });
  });

  await t.step("transformation methods", async (t) => {
    await t.step("add time", () => {
      const date = new Date("2023-06-15T10:30:00");

      const addedDays = new DateGuardian().add(5, 'days').parse(date);
      asserts.assertEquals(addedDays.getDate(), 20);

      const addedMonths = new DateGuardian().add(2, 'months').parse(date);
      asserts.assertEquals(addedMonths.getMonth(), 7); // August (0-indexed)

      const addedYears = new DateGuardian().add(1, 'years').parse(date);
      asserts.assertEquals(addedYears.getFullYear(), 2024);
    });

    await t.step("add specific units", () => {
      const date = new Date("2023-06-15T10:30:00");

      const addedDays = new DateGuardian().addDays(10).parse(date);
      asserts.assertEquals(addedDays.getDate(), 25);

      const addedMonths = new DateGuardian().addMonths(3).parse(date);
      asserts.assertEquals(addedMonths.getMonth(), 8); // September (0-indexed)

      const addedYears = new DateGuardian().addYears(2).parse(date);
      asserts.assertEquals(addedYears.getFullYear(), 2025);
    });

    await t.step("to timezone", () => {
      const date = new Date("2023-06-15T10:30:00");

      // Convert to different timezone (offset in minutes)
      const converted = new DateGuardian().toTimezone(-300).parse(date); // UTC-5
      asserts.assertInstanceOf(converted, Date);
    });

    await t.step("to UTC", () => {
      const date = new Date("2023-06-15T10:30:00");

      const utcDate = new DateGuardian().toUTC().parse(date);
      asserts.assertInstanceOf(utcDate, Date);
    });

    await t.step("format relative", () => {
      const now = new Date();
      
      // Test with a date 2 hours ago
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const relative = new DateGuardian().formatRelative().parse(twoHoursAgo);
      asserts.assertStringIncludes(relative, "ago");
    });

    await t.step("duration", () => {
      const now = new Date();
      
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const duration = new DateGuardian().duration('hours').parse(oneHourAgo);
      asserts.assertEquals(duration, 1);
    });

    await t.step("week number", () => {
      const date = new Date("2023-06-15");
      
      const weekNum = new DateGuardian().weekNumber().parse(date);
      asserts.assertEquals(typeof weekNum, "number");
      asserts.assert(weekNum >= 1 && weekNum <= 53);
    });

    await t.step("day of year", () => {
      const date = new Date("2023-01-01");
      
      const dayOfYear = new DateGuardian().dayOfYear().parse(date);
      asserts.assertEquals(dayOfYear, 1);
      
      const midYear = new Date("2023-07-01");
      const midDayOfYear = new DateGuardian().dayOfYear().parse(midYear);
      asserts.assert(midDayOfYear > 180);
    });

    await t.step("diff", () => {
      const date1 = new Date("2023-06-15T10:00:00");
      const date2 = new Date("2023-06-15T12:00:00");
      
      const diffHours = new DateGuardian().diff(date1, 'hours').parse(date2);
      asserts.assertEquals(diffHours, 2);
      
      const diffDays = new DateGuardian().diff(new Date("2023-06-15"), 'days').parse(new Date("2023-06-20"));
      asserts.assertEquals(diffDays, 5);
    });
  });

  await t.step("nullable and optional chaining", async (t) => {
    await t.step("nullable().optional() allows null, undefined, and valid date", () => {
      const guard = new DateGuardian().nullable().optional();
      
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertEquals(guard.parse(undefined), undefined);
      
      const testDate = new Date("2023-06-15");
      asserts.assertEquals(guard.parse(testDate), testDate);
      
      const anotherDate = new Date("2024-01-01");
      asserts.assertEquals(guard.parse(anotherDate), anotherDate);
    });

    await t.step("optional().nullable() allows undefined, null, and valid date", () => {
      const guard = new DateGuardian().optional().nullable();
      
      asserts.assertEquals(guard.parse(undefined), undefined);
      asserts.assertEquals(guard.parse(null), null);
      
      const testDate = new Date("2023-06-15");
      asserts.assertEquals(guard.parse(testDate), testDate);
      
      const anotherDate = new Date("2024-01-01");
      asserts.assertEquals(guard.parse(anotherDate), anotherDate);
    });

    await t.step("nullable().optional() rejects invalid dates", () => {
      const guard = new DateGuardian().nullable().optional();
      
      asserts.assertThrows(() => guard.parse("invalid-date"));
      asserts.assertThrows(() => guard.parse(123));
      asserts.assertThrows(() => guard.parse({}));
      asserts.assertThrows(() => guard.parse(new Date("invalid")));
    });

    await t.step("optional().nullable() rejects invalid dates", () => {
      const guard = new DateGuardian().optional().nullable();
      
      asserts.assertThrows(() => guard.parse("invalid-date"));
      asserts.assertThrows(() => guard.parse(123));
      asserts.assertThrows(() => guard.parse({}));
      asserts.assertThrows(() => guard.parse(new Date("invalid")));
    });
  });
});
