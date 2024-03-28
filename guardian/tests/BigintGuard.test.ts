import { Guardian, GuardianError } from '../mod.ts';

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
        assertEquals(Guardian.bigint().min(5n)(10n), 10n);
        assertEquals(Guardian.bigint().min(5n)(5n), 5n);
        assertThrows(() => Guardian.bigint().min(5n)(4n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test max',
      fn(): void {
        assertEquals(Guardian.bigint().max(10n)(5n), 5n);
        assertEquals(Guardian.bigint().max(10n)(10n), 10n);
        assertThrows(() => Guardian.bigint().max(10n)(11n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test between',
      fn(): void {
        assertEquals(Guardian.bigint().between(5n, 10n)(7n), 7n);
        assertEquals(Guardian.bigint().between(5n, 10n)(5n), 5n);
        assertEquals(Guardian.bigint().between(5n, 10n)(10n), 10n);
        assertThrows(
          () => Guardian.bigint().between(5n, 10n)(4n),
          GuardianError,
        );
        assertThrows(
          () => Guardian.bigint().between(5n, 10n)(11n),
          GuardianError,
        );
      },
    });

    it({
      name: 'BigintGuardian - Test gt',
      fn(): void {
        assertEquals(Guardian.bigint().gt(5n)(10n), 10n);
        assertThrows(() => Guardian.bigint().gt(5n)(5n), GuardianError);
        assertThrows(() => Guardian.bigint().gt(5n)(4n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test lt',
      fn(): void {
        assertEquals(Guardian.bigint().lt(10n)(5n), 5n);
        assertThrows(() => Guardian.bigint().lt(10n)(10n), GuardianError);
        assertThrows(() => Guardian.bigint().lt(10n)(11n), GuardianError);
      },
    });

    it({
      name: 'BigintGuardian - Test pattern',
      fn(): void {
        assertEquals(Guardian.bigint().pattern(/^[0-9]+$/)(12345n), 12345n);
        assertThrows(
          () => Guardian.bigint().pattern(/^[0-4]+$/)(BigInt(23445n)),
          GuardianError,
        );
      },
    });

    it({
      name: 'BigintGuardian - Test aadhaar',
      fn(): void {
        assertEquals(Guardian.bigint().aadhaar()(212343323123n), 212343323123n);
        assertThrows(
          () => Guardian.bigint().aadhaar()(112343323123n),
          GuardianError,
        );
      },
    });

    it({
      name: 'BigintGuardian - Test mobile',
      fn(): void {
        assertEquals(Guardian.bigint().mobile()(9876543210n), 9876543210n);
        assertThrows(
          () => Guardian.bigint().mobile()(1234567890n),
          GuardianError,
        );
      },
    });
  });
});
