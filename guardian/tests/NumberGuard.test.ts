import { GuardianError, numberGuard } from '../mod.ts';

import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Guardian', () => {
  describe('Number', () => {
    it({
      name: 'NumberGuardian - Test toDate',
      fn(): void {
        assertEquals(numberGuard.toDate()(1577836800), new Date('2020-01-01'));
      },
    });

    it({
      name: 'NumberGuardian - Test float',
      fn(): void {
        assertEquals(numberGuard.float()(3.14), 3.14);
        // assertThrows(() => numberGuard.float()(3), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test integer',
      fn(): void {
        assertEquals(numberGuard.integer()(42), 42);
        assertThrows(() => numberGuard.integer()(3.14), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test min',
      fn(): void {
        assertEquals(numberGuard.min(5)(10), 10);
        assertThrows(() => numberGuard.min(5)(3), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test max',
      fn(): void {
        assertEquals(numberGuard.max(5)(3), 3);
        assertThrows(() => numberGuard.max(5)(10), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test gt',
      fn(): void {
        assertEquals(numberGuard.gt(5)(10), 10);
        assertThrows(() => numberGuard.gt(5)(5), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test lt',
      fn(): void {
        assertEquals(numberGuard.lt(5)(3), 3);
        assertThrows(() => numberGuard.lt(5)(5), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test between',
      fn(): void {
        assertEquals(numberGuard.between(2, 5)(3), 3);
        assertThrows(() => numberGuard.between(2, 5)(6), GuardianError);
      },
    });
  });
});
