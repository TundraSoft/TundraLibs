import { Guardian, GuardianError } from '../mod.ts';

import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Guardian', () => {
  describe('Array', () => {
    it({
      name: 'ArrayGuardian - Test of',
      fn(): void {
        const numGuard = Guardian.array().of(Guardian.number());
        assertEquals(numGuard([1, 2, 3]), [1, 2, 3]);
        // assertThrows(
        //   () => numGuard(['3']),
        //   GuardianError,
        // );
      },
    });

    it({
      name: 'ArrayGuardian - Test min',
      fn(): void {
        const numGuard = Guardian.array().of(Guardian.number()).min(3);
        assertEquals(numGuard([1, 2, 3]), [1, 2, 3]);
        assertThrows(
          () => numGuard([1, 2]),
          GuardianError,
        );
      },
    });

    it({
      name: 'ArrayGuardian - Test max',
      fn(): void {
        const numGuard = Guardian.array().of(Guardian.number()).max(3);
        assertEquals(numGuard([1, 2, 3]), [1, 2, 3]);
        assertThrows(
          () => numGuard([1, 2, 3, 4, 5]),
          GuardianError,
        );
      },
    });

    it({
      name: 'ArrayGuardian - Test between',
      fn(): void {
        const numGuard = Guardian.array().of(Guardian.number()).between(3, 5);
        assertEquals(numGuard([1, 2, 3]), [1, 2, 3]);
        assertThrows(
          () => numGuard([1, 2, 3, 4, 5, 6, 7]),
          GuardianError,
        );
        assertThrows(
          () => numGuard([1, 2]),
          GuardianError,
        );
      },
    });
  });
});
