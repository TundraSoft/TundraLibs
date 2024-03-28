import { Guardian, GuardianError } from '../mod.ts';

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
        assertEquals(
          Guardian.number().toDate()(1577836800),
          new Date('2020-01-01'),
        );
      },
    });

    it({
      name: 'NumberGuardian - Test float',
      fn(): void {
        assertEquals(Guardian.number().float()(3.14), 3.14);
        // assertThrows(() => Guardian.number().float()(3), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test integer',
      fn(): void {
        assertEquals(Guardian.number().integer()(42), 42);
        assertThrows(() => Guardian.number().integer()(3.14), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test min',
      fn(): void {
        assertEquals(Guardian.number().min(5)(10), 10);
        assertThrows(() => Guardian.number().min(5)(3), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test max',
      fn(): void {
        assertEquals(Guardian.number().max(5)(3), 3);
        assertThrows(() => Guardian.number().max(5)(10), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test gt',
      fn(): void {
        assertEquals(Guardian.number().gt(5)(10), 10);
        assertThrows(() => Guardian.number().gt(5)(5), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test lt',
      fn(): void {
        assertEquals(Guardian.number().lt(5)(3), 3);
        assertThrows(() => Guardian.number().lt(5)(5), GuardianError);
      },
    });

    it({
      name: 'NumberGuardian - Test between',
      fn(): void {
        assertEquals(Guardian.number().between(2, 5)(3), 3);
        assertThrows(() => Guardian.number().between(2, 5)(6), GuardianError);
      },
    });
  });
});
