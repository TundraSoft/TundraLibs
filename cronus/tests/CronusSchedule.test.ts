import { assert, assertEquals, assertFalse } from '../../dev.dependencies.ts';
import { Cronus } from '../Cronus.ts';
import { MONTH_NAMES } from '../const/mod.ts';

function getRandomArbitrary(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

Deno.test({
  name: '[module="Cronus"] Test if * * * * * * is valid syntax',
  fn() {
    assertEquals(Cronus.validateSchedule('* * * * *'), true);
  },
});

//#region Minute
Deno.test({
  name: '[module="Cronus"] Test minute - Every X minutes (Valid)',
  fn() {
    for (let i = 0; i <= 59; i++) {
      assert(Cronus.validateSchedule(`*/${i} * * * *`));
      assertFalse(Cronus.validateSchedule(`0/${i} * * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test minute - Xth minute (Valid)',
  fn() {
    for (let i = 0; i <= 59; i++) {
      assert(Cronus.validateSchedule(`${i} * * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test minute - Range (Valid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(0, 60),
        max = getRandomArbitrary(min, 60);
      assert(Cronus.validateSchedule(`${min}-${max} * * * *`));
      // Although invalid, it must pass @TODO - Maybe add a check here?
      assert(Cronus.validateSchedule(`${max}-${min} * * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test minute - List (Valid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const set: { [key: number]: boolean } = {};
      while (Object.keys(set).length <= 10) {
        set[getRandomArbitrary(0, 60)] = true;
      }
      assert(Cronus.validateSchedule(`${Object.keys(set).join(',')} * * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test minute - Every X minutes (Invalid)',
  fn() {
    for (let i = -1; i > -30; i--) {
      assertFalse(Cronus.validateSchedule(`*/${i} * * * *`));
      // assertFalse(Cronus.validateSchedule(`0/${i} * * * *`));
    }
    for (let i = 60; i <= 99; i++) {
      assertFalse(Cronus.validateSchedule(`*/${i} * * * *`));
      // assertFalse(Cronus.validateSchedule(`0/${i} * * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test minute - Xth minute (Invalid)',
  fn() {
    for (let i = -1; i > -30; i--) {
      assertFalse(Cronus.validateSchedule(`${i} * * * *`));
    }
    for (let i = 60; i <= 99; i++) {
      assertFalse(Cronus.validateSchedule(`${i} * * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test minute - Range (Invalid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(-30, 0),
        max = getRandomArbitrary(0, 60);
      assertFalse(Cronus.validateSchedule(`${min}-${max} * * * *`));
      // // Although invalid, it must pass @TODO - Maybe add a check here?
      assertFalse(Cronus.validateSchedule(`${max}-${min} * * * *`));
    }
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(0, 60),
        max = getRandomArbitrary(60, 120);
      assertFalse(Cronus.validateSchedule(`${min}-${max} * * * *`));
      // // Although invalid, it must pass @TODO - Maybe add a check here?
      assertFalse(Cronus.validateSchedule(`${max}-${min} * * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test minute - List (Invalid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const set: { [key: number]: boolean } = {};
      while (Object.keys(set).length <= 5) {
        set[getRandomArbitrary(-30, 0)] = true;
      }
      while (Object.keys(set).length <= 10) {
        set[getRandomArbitrary(60, 120)] = true;
      }
      assertFalse(
        Cronus.validateSchedule(`${Object.keys(set).join(',')} * * * *`),
      );
    }
  },
});
//#endregion Minute

//#region Hour
Deno.test({
  name: '[module="Cronus"] Test hour - Every X hour (Valid)',
  fn() {
    for (let i = 0; i <= 23; i++) {
      assert(Cronus.validateSchedule(`* */${i} * * *`));
      assertFalse(Cronus.validateSchedule(`* 0/${i} * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test hour - Xth hour (Valid)',
  fn() {
    for (let i = 0; i <= 23; i++) {
      assert(Cronus.validateSchedule(`* ${i} * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test hour - Range (Valid)',
  fn() {
    for (let i = 0; i <= 23; i++) {
      const min = getRandomArbitrary(0, 23),
        max = getRandomArbitrary(min, 23);
      assert(Cronus.validateSchedule(`* ${min}-${max} * * *`));
      // Although invalid, it must pass @TODO - Maybe add a check here?
      assert(Cronus.validateSchedule(`* ${max}-${min} * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test hour - List (Valid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const set: { [key: number]: boolean } = {};
      while (Object.keys(set).length <= 10) {
        set[getRandomArbitrary(0, 23)] = true;
      }
      assert(Cronus.validateSchedule(`* ${Object.keys(set).join(',')} * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test hour - Every X hour (Invalid)',
  fn() {
    for (let i = -1; i > -60; i--) {
      assertFalse(Cronus.validateSchedule(`* */${i} * * *`));
      // assertFalse(Cronus.validateSchedule(`* 0/${i} * * *`));
    }
    for (let i = 60; i <= 99; i++) {
      assertFalse(Cronus.validateSchedule(`* */${i} * * *`));
      // assertFalse(Cronus.validateSchedule(`* 0/${i} * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test hour - Xth hour (Invalid)',
  fn() {
    for (let i = -1; i > -30; i--) {
      assertFalse(Cronus.validateSchedule(`* ${i} * * *`));
    }
    for (let i = 24; i <= 99; i++) {
      assertFalse(Cronus.validateSchedule(`* ${i} * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test hour - Range (Invalid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(-30, 0),
        max = getRandomArbitrary(0, 23);
      assertFalse(Cronus.validateSchedule(`* ${min}-${max} * * *`));
      // // Although invalid, it must pass @TODO - Maybe add a check here?
      assertFalse(Cronus.validateSchedule(`* ${max}-${min} * * *`));
    }
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(0, 23),
        max = getRandomArbitrary(24, 120);
      assertFalse(Cronus.validateSchedule(`* ${min}-${max} * * *`));
      // // Although invalid, it must pass @TODO - Maybe add a check here?
      assertFalse(Cronus.validateSchedule(`* ${max}-${min} * * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test hour - List (Invalid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const set: { [key: number]: boolean } = {};
      while (Object.keys(set).length <= 5) {
        set[getRandomArbitrary(-30, 0)] = true;
      }
      while (Object.keys(set).length <= 10) {
        set[getRandomArbitrary(60, 120)] = true;
      }
      assertFalse(
        Cronus.validateSchedule(`* ${Object.keys(set).join(',')} * * *`),
      );
    }
  },
});
//#endregion Hour

//#region Date
Deno.test({
  name: '[module="Cronus"] Test Day - Every X Day (Valid)',
  fn() {
    for (let i = 1; i <= 31; i++) {
      assert(Cronus.validateSchedule(`* * */${i} * *`));
      assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Day - Xth Day (Valid)',
  fn() {
    for (let i = 1; i <= 31; i++) {
      assert(Cronus.validateSchedule(`* * ${i} * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Day - Range (Valid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(1, 31),
        max = getRandomArbitrary(min, 31);
      assert(Cronus.validateSchedule(`* * ${min}-${max} * *`));
      // Although invalid, it must pass @TODO - Maybe add a check here?
      assert(Cronus.validateSchedule(`* * ${max}-${min} * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Day - List (Valid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const set: { [key: number]: boolean } = {};
      while (Object.keys(set).length <= 10) {
        set[getRandomArbitrary(1, 31)] = true;
      }
      assert(Cronus.validateSchedule(`* * ${Object.keys(set).join(',')} * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Day - Every X Day (Invalid)',
  fn() {
    for (let i = -1; i > -60; i--) {
      assertFalse(Cronus.validateSchedule(`* * */${i} * *`));
      assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
    }
    for (let i = 32; i <= 99; i++) {
      assertFalse(Cronus.validateSchedule(`* * */${i} * *`));
      assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Day - Xth hour (Invalid)',
  fn() {
    for (let i = -1; i > -30; i--) {
      assertFalse(Cronus.validateSchedule(`* * ${i} * *`));
    }
    for (let i = 32; i <= 99; i++) {
      assertFalse(Cronus.validateSchedule(`* * ${i} * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Day - Range (Invalid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(-32, 0),
        max = getRandomArbitrary(0, 31);
      assertFalse(Cronus.validateSchedule(`* * ${min}-${max} * *`));
      // // Although invalid, it must pass @TODO - Maybe add a check here?
      assertFalse(Cronus.validateSchedule(`* * ${max}-${min} * *`));
    }
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(0, 31),
        max = getRandomArbitrary(32, 120);
      assertFalse(Cronus.validateSchedule(`* * ${min}-${max} * *`));
      // // Although invalid, it must pass @TODO - Maybe add a check here?
      assertFalse(Cronus.validateSchedule(`* * ${max}-${min} * *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Day - List (Invalid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const set: { [key: number]: boolean } = {};
      while (Object.keys(set).length <= 5) {
        set[getRandomArbitrary(-30, 0)] = true;
      }
      while (Object.keys(set).length <= 10) {
        set[getRandomArbitrary(32, 120)] = true;
      }
      assertFalse(
        Cronus.validateSchedule(`* * ${Object.keys(set).join(',')} * *`),
      );
    }
  },
});
//#endregion Date

//#region Month
Deno.test({
  name: '[module="Cronus"] Test Month - Every X Month (Valid)',
  fn() {
    for (let i = 1; i <= 12; i++) {
      assert(Cronus.validateSchedule(`* * * */${i} *`));
      const mn = Object.entries(MONTH_NAMES).find(([_name, no]) => i === no)
        ?.[0];
      assert(Cronus.validateSchedule(`* * * */${mn} *`));
      assertFalse(Cronus.validateSchedule(`* * * 0/${i} *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Month - Xth DayMonth (Valid)',
  fn() {
    for (let i = 1; i <= 12; i++) {
      assert(Cronus.validateSchedule(`* * * ${i} *`));
      const mn = Object.entries(MONTH_NAMES).find(([_name, no]) => i === no)
        ?.[0];
      assert(Cronus.validateSchedule(`* * * ${mn} *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Month - Range (Valid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const min = getRandomArbitrary(1, 12),
        max = getRandomArbitrary(min, 12);
      assert(Cronus.validateSchedule(`* * * ${min}-${max} *`));
      // Although invalid, it must pass @TODO - Maybe add a check here?
      assert(Cronus.validateSchedule(`* * * ${max}-${min} *`));
    }
  },
});

Deno.test({
  name: '[module="Cronus"] Test Month - List (Valid)',
  fn() {
    for (let i = 0; i <= 10; i++) {
      const set: { [key: number]: boolean } = {};
      while (Object.keys(set).length <= 10) {
        set[getRandomArbitrary(1, 12)] = true;
      }
      assert(Cronus.validateSchedule(`* * * ${Object.keys(set).join(',')} *`));
    }
  },
});

// Deno.test({
//   name: '[module="Cronus"] Test Month - Every X Month (Invalid)',
//   fn() {
//     for (let i = -1; i > -60; i--) {
//       assertFalse(Cronus.validateSchedule(`* * */${i} * *`));
//       assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
//     }
//     for (let i = 32; i <= 99; i++) {
//       assertFalse(Cronus.validateSchedule(`* * */${i} * *`));
//       assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
//     }
//   },
// });

// Deno.test({
//   name: '[module="Cronus"] Test Day - Xth hour (Invalid)',
//   fn() {
//     for (let i = -1; i > -30; i--) {
//       assertFalse(Cronus.validateSchedule(`* * ${i} * *`));
//     }
//     for (let i = 32; i <= 99; i++) {
//       assertFalse(Cronus.validateSchedule(`* * ${i} * *`));
//     }
//   },
// });

// Deno.test({
//   name: '[module="Cronus"] Test Day - Range (Invalid)',
//   fn() {
//     for (let i = 0; i <= 10; i++) {
//       const min = getRandomArbitrary(-32, 0),
//         max = getRandomArbitrary(0, 31);
//       assertFalse(Cronus.validateSchedule(`* * ${min}-${max} * *`));
//       // // Although invalid, it must pass @TODO - Maybe add a check here?
//       assertFalse(Cronus.validateSchedule(`* * ${max}-${min} * *`));
//     }
//     for (let i = 0; i <= 10; i++) {
//       const min = getRandomArbitrary(0, 31),
//         max = getRandomArbitrary(32, 120);
//       assertFalse(Cronus.validateSchedule(`* * ${min}-${max} * *`));
//       // // Although invalid, it must pass @TODO - Maybe add a check here?
//       assertFalse(Cronus.validateSchedule(`* * ${max}-${min} * *`));
//     }
//   },
// });

// Deno.test({
//   name: '[module="Cronus"] Test Day - List (Invalid)',
//   fn() {
//     for (let i = 0; i <= 10; i++) {
//       const set: { [key: number]: boolean } = {};
//       while (Object.keys(set).length <= 5) {
//         set[getRandomArbitrary(-30, 0)] = true;
//       }
//       while (Object.keys(set).length <= 10) {
//         set[getRandomArbitrary(32, 120)] = true;
//       }
//       assertFalse(
//         Cronus.validateSchedule(`* * ${Object.keys(set).join(',')} * *`),
//       );
//     }
//   },
// });
//#endregion Month

//#region Day

//#endregion Day

Deno.test('validateSchedule should return true for a valid cron schedule', () => {
  const schedule = '0 0 * * *'; // Every day at midnight
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, true);
});

Deno.test('validateSchedule should return false for an invalid number of schedule parts', () => {
  const schedule = '0 0 * *'; // Missing day of week field
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, false);
});

Deno.test('validateSchedule should return false for an invalid minute field', () => {
  const schedule = '60 0 * * *'; // Invalid minute value
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, false);
});

Deno.test('validateSchedule should return false for an invalid hour field', () => {
  const schedule = '0 24 * * *'; // Invalid hour value
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, false);
});

Deno.test('validateSchedule should return false for an invalid date field', () => {
  const schedule = '0 0 32 * *'; // Invalid date value
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, false);
});

Deno.test('validateSchedule should return false for an invalid month field', () => {
  const schedule = '0 0 * JAN13,FEB *'; // Invalid month value
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, false);
});

Deno.test('validateSchedule should return false for an invalid day of week field', () => {
  const schedule = '0 0 * * 8'; // Invalid day of week value
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, false);
});

Deno.test('validateSchedule should return true for a valid cron schedule with step values', () => {
  const schedule = '*/15 2-20/2 1-10/3 JAN,FEB,APR,JUN *'; // Every 15 minutes from minute 0 through 59, every other hour from 2 through 20, every third day-of-month from 1 through 10, in January, February, April, and June
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, true);
});

Deno.test('validateSchedule should return true for a valid cron schedule with range values', () => {
  const schedule = '0 0 1-15,20-31 * *'; // At midnight on the 1st through the 15th days of the month and on the 20th through the 31st days of the month
  const result = Cronus.validateSchedule(schedule);
  assertEquals(result, true);
});
