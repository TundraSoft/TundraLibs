import { assert, assertFalse } from '../../dev.dependencies.ts';
import { Cronus } from '../Cronus.ts';

function getRandomArbitrary(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

Deno.test({
  name: '[module="Cronus"] Test if * * * * * * is valid syntax',
  fn() {
    assert(Cronus.validateSchedule('* * * * *'));
  },
});

//#region Minute
Deno.test({
  name: '[module="Cronus"] Test minute - Every X minutes (Valid)',
  fn() {
    for (let i = 0; i <= 59; i++) {
      assert(Cronus.validateSchedule(`*/${i} * * * *`));
      // assert(Cronus.validateSchedule(`0/${i} * * * *`));
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
      // assert(Cronus.validateSchedule(`* 0/${i} * * *`));
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

//#region Day
// Deno.test({
//   name: '[module="Cronus"] Test Day - Every X Day (Valid)',
//   fn() {
//     for (let i = 1; i <= 31; i++) {
//       assert(Cronus.validateSchedule(`* * */${i} * *`));
//       // assert(Cronus.validateSchedule(`* * 0/${i} * *`));
//     }
//   },
// });

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
//#endregion Day

