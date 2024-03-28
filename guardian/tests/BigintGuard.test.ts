import { bigintGuard, GuardianError } from '../mod.ts';

import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Guardian', () => {
  describe('Bigint', () => {
    it({
      name: 'BigintGuardian - Test min',
      fn(): void {
        assertEquals(bigintGuard.min(5n)(10n), 10n);
        assertEquals(bigintGuard.min(5n)(5n), 5n);
        assertThrows(() => bigintGuard.min(5n)(4n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test max',
      fn(): void {
        assertEquals(bigintGuard.max(10n)(5n), 5n);
        assertEquals(bigintGuard.max(10n)(10n), 10n);
        assertThrows(() => bigintGuard.max(10n)(11n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test between',
      fn(): void {
        assertEquals(bigintGuard.between(5n, 10n)(7n), 7n);
        assertEquals(bigintGuard.between(5n, 10n)(5n), 5n);
        assertEquals(bigintGuard.between(5n, 10n)(10n), 10n);
        assertThrows(() => bigintGuard.between(5n, 10n)(4n), GuardianError);
        assertThrows(() => bigintGuard.between(5n, 10n)(11n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test gt',
      fn(): void {
        assertEquals(bigintGuard.gt(5n)(10n), 10n);
        assertThrows(() => bigintGuard.gt(5n)(5n), GuardianError);
        assertThrows(() => bigintGuard.gt(5n)(4n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test lt',
      fn(): void {
        assertEquals(bigintGuard.lt(10n)(5n), 5n);
        assertThrows(() => bigintGuard.lt(10n)(10n), GuardianError);
        assertThrows(() => bigintGuard.lt(10n)(11n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test pattern',
      fn(): void {
        assertEquals(bigintGuard.pattern(/^[0-9]+$/)(12345n), 12345n);
        assertThrows(
          () => bigintGuard.pattern(/^[0-4]+$/)(BigInt(23445n)),
          GuardianError,
        );
      },
    });

    it({
      name: 'BigintGuardian - Test aadhaar',
      fn(): void {
        assertEquals(bigintGuard.aadhaar()(212343323123n), 212343323123n);
        assertThrows(() => bigintGuard.aadhaar()(112343323123n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test mobile',
      fn(): void {
        assertEquals(bigintGuard.mobile()(9876543210n), 9876543210n);
        assertThrows(() => bigintGuard.mobile()(1234567890n), GuardianError);
      },
    });
  });
});
