import {
  assert,
  assertEquals,
  assertFalse,
  describe,
  it,
} from '../../dev.dependencies.ts';
import { Cronus } from '../Cronus.ts';
import { MONTH_NAMES } from '../const/mod.ts';

function getRandomArbitrary(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

describe('Cronus', () => {
  describe('schedule validation', () => {
    it('should return true for a valid cron schedule', () => {
      const schedule = '0 0 * * *'; // Every day at midnight
      const result = Cronus.validateSchedule(schedule);
      assertEquals(result, true);
    });

    it('should return false for an invalid number of schedule parts', () => {
      const schedule = '0 0 * *'; // Missing day of week field
      const result = Cronus.validateSchedule(schedule);
      assertEquals(result, false);
    });

    describe('minute', () => {
      it('should validate every X minutes', () => {
        for (let i = 0; i <= 59; i++) {
          assert(Cronus.validateSchedule(`*/${i} * * * *`));
          assertFalse(Cronus.validateSchedule(`0/${i} * * * *`));
        }
      });

      it('should validate Xth minute', () => {
        for (let i = 0; i <= 59; i++) {
          assert(Cronus.validateSchedule(`${i} * * * *`));
        }
      });

      it('should validate range', () => {
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(0, 60),
            max = getRandomArbitrary(min, 60);
          assert(Cronus.validateSchedule(`${min}-${max} * * * *`));
          // Although invalid, it must pass @TODO - Maybe add a check here?
          assert(Cronus.validateSchedule(`${max}-${min} * * * *`));
        }
      });

      it('should validate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(0, 60)] = true;
          }
          assert(
            Cronus.validateSchedule(`${Object.keys(set).join(',')} * * * *`),
          );
        }
      });

      it('should invalidate every X minutes', () => {
        for (let i = -1; i > -30; i--) {
          assertFalse(Cronus.validateSchedule(`*/${i} * * * *`));
          // assertFalse(Cronus.validateSchedule(`0/${i} * * * *`));
        }
        for (let i = 60; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`*/${i} * * * *`));
          // assertFalse(Cronus.validateSchedule(`0/${i} * * * *`));
        }
      });

      it('should invalidate Xth minute', () => {
        for (let i = -1; i > -30; i--) {
          assertFalse(Cronus.validateSchedule(`${i} * * * *`));
        }
        for (let i = 60; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`${i} * * * *`));
        }
      });

      it('should invalidate range', () => {
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
      });

      it('should invalidate list', () => {
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
      });
    });

    describe('hour', () => {
      it('should validate every X hour', () => {
        for (let i = 0; i <= 23; i++) {
          assert(Cronus.validateSchedule(`* */${i} * * *`));
          assertFalse(Cronus.validateSchedule(`* 0/${i} * * *`));
        }
      });

      it('should validate Xth hour', () => {
        for (let i = 0; i <= 23; i++) {
          assert(Cronus.validateSchedule(`* ${i} * * *`));
        }
      });

      it('should validate range', () => {
        for (let i = 0; i <= 23; i++) {
          const min = getRandomArbitrary(0, 23),
            max = getRandomArbitrary(min, 23);
          assert(Cronus.validateSchedule(`* ${min}-${max} * * *`));
          // Although invalid, it must pass @TODO - Maybe add a check here?
          assert(Cronus.validateSchedule(`* ${max}-${min} * * *`));
        }
      });

      it('should validate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(0, 23)] = true;
          }
          assert(
            Cronus.validateSchedule(`* ${Object.keys(set).join(',')} * * *`),
          );
        }
      });

      it('should invalidate every X hour', () => {
        for (let i = -1; i > -60; i--) {
          assertFalse(Cronus.validateSchedule(`* */${i} * * *`));
          // assertFalse(Cronus.validateSchedule(`* 0/${i} * * *`));
        }
        for (let i = 60; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* */${i} * * *`));
          // assertFalse(Cronus.validateSchedule(`* 0/${i} * * *`));
        }
      });

      it('should invalidate Xth hour', () => {
        for (let i = -1; i > -30; i--) {
          assertFalse(Cronus.validateSchedule(`* ${i} * * *`));
        }
        for (let i = 24; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* ${i} * * *`));
        }
      });

      it('should invalidate range', () => {
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
      });

      it('should invalidate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 5) {
            set[getRandomArbitrary(-30, 0)] = true;
          }
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(32, 120)] = true;
          }
          assertFalse(
            Cronus.validateSchedule(`* ${Object.keys(set).join(',')} * * *`),
          );
        }
      });
    });

    describe('day', () => {
      it('should validate every X day', () => {
        for (let i = 1; i <= 31; i++) {
          assert(Cronus.validateSchedule(`* * */${i} * *`));
          assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
        }
      });

      it('should validate Xth day', () => {
        for (let i = 1; i <= 31; i++) {
          assert(Cronus.validateSchedule(`* * ${i} * *`));
        }
      });

      it('should validate range', () => {
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(1, 31),
            max = getRandomArbitrary(min, 31);
          assert(Cronus.validateSchedule(`* * ${min}-${max} * *`));
          // Although invalid, it must pass @TODO - Maybe add a check here?
          assert(Cronus.validateSchedule(`* * ${max}-${min} * *`));
        }
      });

      it('should validate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(1, 31)] = true;
          }
          assert(
            Cronus.validateSchedule(`* * ${Object.keys(set).join(',')} * *`),
          );
        }
      });

      it('should invalidate every X day', () => {
        for (let i = -1; i > -60; i--) {
          assertFalse(Cronus.validateSchedule(`* * */${i} * *`));
          assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
        }
        for (let i = 32; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* * */${i} * *`));
          assertFalse(Cronus.validateSchedule(`* * 0/${i} * *`));
        }
      });

      it('should invalidate Xth day', () => {
        for (let i = -1; i > -30; i--) {
          assertFalse(Cronus.validateSchedule(`* * ${i} * *`));
        }
        for (let i = 32; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* * ${i} * *`));
        }
      });

      it('should invalidate range', () => {
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
      });

      it('should invalidate list', () => {
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
      });
    });

    describe('month', () => {
      it('should validate every X month', () => {
        for (let i = 1; i <= 12; i++) {
          assert(Cronus.validateSchedule(`* * * */${i} *`));
          const mn = Object.entries(MONTH_NAMES).find(([_name, no]) => i === no)
            ?.[0];
          assert(Cronus.validateSchedule(`* * * */${mn} *`));
          assertFalse(Cronus.validateSchedule(`* * * 0/${i} *`));
        }
      });

      it('should validate Xth month', () => {
        for (let i = 1; i <= 12; i++) {
          assert(Cronus.validateSchedule(`* * * ${i} *`));
          const mn = Object.entries(MONTH_NAMES).find(([_name, no]) => i === no)
            ?.[0];
          assert(Cronus.validateSchedule(`* * * ${mn} *`));
        }
      });

      it('should validate range', () => {
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(1, 12),
            max = getRandomArbitrary(min, 12);
          assert(Cronus.validateSchedule(`* * * ${min}-${max} *`));
          // Although invalid, it must pass @TODO - Maybe add a check here?
          assert(Cronus.validateSchedule(`* * * ${max}-${min} *`));
        }
      });

      it('should validate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(1, 12)] = true;
          }
          assert(
            Cronus.validateSchedule(`* * * ${Object.keys(set).join(',')} *`),
          );
        }
      });

      it('should invalidate every X month', () => {
        for (let i = -1; i > -60; i--) {
          assertFalse(Cronus.validateSchedule(`* * * */${i} *`));
          assertFalse(Cronus.validateSchedule(`* * * 0/${i} *`));
        }
        for (let i = 13; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* * * */${i} *`));
          assertFalse(Cronus.validateSchedule(`* * * 0/${i} *`));
        }
      });

      it('should invalidate Xth month', () => {
        for (let i = -1; i > -30; i--) {
          assertFalse(Cronus.validateSchedule(`* * * ${i} *`));
        }
        for (let i = 13; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* * * ${i} *`));
        }
      });

      it('should invalidate range', () => {
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(-12, 0),
            max = getRandomArbitrary(0, 12);
          assertFalse(Cronus.validateSchedule(`* * * ${min}-${max} *`));
          // // Although invalid, it must pass @TODO - Maybe add a check here?
          assertFalse(Cronus.validateSchedule(`* * * ${max}-${min} *`));
        }
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(0, 12),
            max = getRandomArbitrary(13, 120);
          assertFalse(Cronus.validateSchedule(`* * * ${min}-${max} *`));
          // // Although invalid, it must pass @TODO - Maybe add a check here?
          assertFalse(Cronus.validateSchedule(`* * * ${max}-${min} *`));
        }
      });

      it('should invalidate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 5) {
            set[getRandomArbitrary(-12, 0)] = true;
          }
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(13, 120)] = true;
          }
          assertFalse(
            Cronus.validateSchedule(`* * * ${Object.keys(set).join(',')} *`),
          );
        }
      });
    });

    describe('day of week', () => {
      it('should validate every X day of week', () => {
        for (let i = 0; i <= 6; i++) {
          assert(Cronus.validateSchedule(`* * * * */${i}`));
          assertFalse(Cronus.validateSchedule(`* * * * 0/${i}`));
        }
      });

      it('should validate Xth day of week', () => {
        for (let i = 0; i <= 6; i++) {
          assert(Cronus.validateSchedule(`* * * * ${i}`));
        }
      });

      it('should validate range', () => {
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(0, 6),
            max = getRandomArbitrary(min, 6);
          assert(Cronus.validateSchedule(`* * * * ${min}-${max}`));
          // Although invalid, it must pass @TODO - Maybe add a check here?
          assert(Cronus.validateSchedule(`* * * * ${max}-${min}`));
        }
      });

      // it('should validate list', () => {
      //   for (let i = 0; i <= 10; i++) {
      //     const set: { [key: number]: boolean } = {};
      //     while (Object.keys(set).length <= 10) {
      //       set[getRandomArbitrary(0, 6)] = true;
      //     }
      //     console.log(`* * * * ${Object.keys(set).join(',')} *`);
      //     assert(Cronus.validateSchedule(`* * * * ${Object.keys(set).join(',')} *`));
      //   }
      // });

      it('should invalidate every X day of week', () => {
        for (let i = -1; i > -7; i--) {
          assertFalse(Cronus.validateSchedule(`* * * * */${i}`));
          assertFalse(Cronus.validateSchedule(`* * * * 0/${i}`));
        }
        for (let i = 7; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* * * * */${i}`));
          assertFalse(Cronus.validateSchedule(`* * * * 0/${i}`));
        }
      });

      it('should invalidate Xth day of week', () => {
        for (let i = -1; i > -7; i--) {
          assertFalse(Cronus.validateSchedule(`* * * * ${i}`));
        }
        for (let i = 7; i <= 99; i++) {
          assertFalse(Cronus.validateSchedule(`* * * * ${i}`));
        }
      });

      it('should invalidate range', () => {
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(-7, 0),
            max = getRandomArbitrary(0, 6);
          assertFalse(Cronus.validateSchedule(`* * * * ${min}-${max}`));
          // // Although invalid, it must pass @TODO - Maybe add a check here?
          assertFalse(Cronus.validateSchedule(`* * * * ${max}-${min}`));
        }
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(0, 6),
            max = getRandomArbitrary(7, 120);
          assertFalse(Cronus.validateSchedule(`* * * * ${min}-${max}`));
          // // Although invalid, it must pass @TODO - Maybe add a check here?
          assertFalse(Cronus.validateSchedule(`* * * * ${max}-${min}`));
        }
      });

      it('should invalidate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 5) {
            set[getRandomArbitrary(-7, 0)] = true;
          }
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(7, 120)] = true;
          }
          assertFalse(
            Cronus.validateSchedule(`* * * * ${Object.keys(set).join(',')} *`),
          );
        }
      });
    });

    describe('year', () => {
      // it('should validate every X year', () => {
      //   for (let i = 1970; i <= 2100; i++) {
      //     assert(Cronus.validateSchedule(`* * * * * */${i}`));
      //     assertFalse(Cronus.validateSchedule(`* * * * * 0/${i}`));
      //   }
      // });

      // it('should validate Xth year', () => {
      //   for (let i = 1970; i <= 2100; i++) {
      //     assert(Cronus.validateSchedule(`* * * * * ${i}`));
      //   }
      // });

      // it('should validate range', () => {
      //   for (let i = 0; i <= 10; i++) {
      //     const min = getRandomArbitrary(1970, 2100),
      //       max = getRandomArbitrary(min, 2100);
      //     assert(Cronus.validateSchedule(`* * * * * ${min}-${max}`));
      //     // Although invalid, it must pass @TODO - Maybe add a check here?
      //     assert(Cronus.validateSchedule(`* * * * * ${max}-${min}`));
      //   }
      // });

      // it('should validate list', () => {
      //   for (let i = 0; i <= 10; i++) {
      //     const set: { [key: number]: boolean } = {};
      //     while (Object.keys(set).length <= 10) {
      //       set[getRandomArbitrary(1970, 2100)] = true;
      //     }
      //     assert(Cronus.validateSchedule(`* * * * * ${Object.keys(set).join(',')} *`));
      //   }
      // });

      it('should invalidate every X year', () => {
        for (let i = 1969; i > 1900; i--) {
          assertFalse(Cronus.validateSchedule(`* * * * * */${i}`));
          assertFalse(Cronus.validateSchedule(`* * * * * 0/${i}`));
        }
        for (let i = 2101; i <= 2200; i++) {
          assertFalse(Cronus.validateSchedule(`* * * * * */${i}`));
          assertFalse(Cronus.validateSchedule(`* * * * * 0/${i}`));
        }
      });

      it('should invalidate Xth year', () => {
        for (let i = 1969; i > 1900; i--) {
          assertFalse(Cronus.validateSchedule(`* * * * * ${i}`));
        }
        for (let i = 2101; i <= 2200; i++) {
          assertFalse(Cronus.validateSchedule(`* * * * * ${i}`));
        }
      });

      it('should invalidate range', () => {
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(1900, 1970),
            max = getRandomArbitrary(1970, 2100);
          assertFalse(Cronus.validateSchedule(`* * * * * ${min}-${max}`));
          // // Although invalid, it must pass @TODO - Maybe add a check here?
          assertFalse(Cronus.validateSchedule(`* * * * * ${max}-${min}`));
        }
        for (let i = 0; i <= 10; i++) {
          const min = getRandomArbitrary(1970, 2100),
            max = getRandomArbitrary(2101, 2200);
          assertFalse(Cronus.validateSchedule(`* * * * * ${min}-${max}`));
          // // Although invalid, it must pass @TODO - Maybe add a check here?
          assertFalse(Cronus.validateSchedule(`* * * * * ${max}-${min}`));
        }
      });

      it('should invalidate list', () => {
        for (let i = 0; i <= 10; i++) {
          const set: { [key: number]: boolean } = {};
          while (Object.keys(set).length <= 5) {
            set[getRandomArbitrary(1900, 1970)] = true;
          }
          while (Object.keys(set).length <= 10) {
            set[getRandomArbitrary(2101, 2200)] = true;
          }
          assertFalse(
            Cronus.validateSchedule(
              `* * * * * ${Object.keys(set).join(',')} *`,
            ),
          );
        }
      });
    });
  });
});
