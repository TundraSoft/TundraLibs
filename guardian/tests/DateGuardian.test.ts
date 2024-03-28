import { Guardian, GuardianError } from '../mod.ts';
import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Guardian', () => {
  describe('Date', () => {
    it({
      name: 'DateGuardian - Test toISOString',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().toISOString();
        // const result = guardian.toISOString().value();
        assertEquals(guardian(date), '2022-01-01T00:00:00.000Z');
      },
    });

    it({
      name: 'DateGuardian - Test getTime',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().getTime();
        assertEquals(guardian(date), 1640995200000);
      },
    });

    it({
      name: 'DateGuardian - Test format',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().format('yyyy-MM-dd');
        // const result = guardian.format('yyyy-MM-dd').value();
        assertEquals(guardian(date), '2022-01-01');
      },
    });

    it({
      name: 'DateGuardian - Test min',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().min(
          new Date('2021-12-31T00:00:00.000Z'),
        );
        assertEquals(guardian(date), date);
        assertThrows(
          () => guardian(new Date('2019-01-01T00:00:00.000Z')),
          GuardianError,
        );
      },
    });

    it({
      name: 'DateGuardian - Test max',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().max(
          new Date('2022-01-02T00:00:00.000Z'),
        );
        assertEquals(guardian(date), date);
        assertThrows(
          () => guardian(new Date('2026-12-31T00:00:00.000Z')),
          GuardianError,
        );
      },
    });

    it({
      name: 'DateGuardian - Test between',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().between(
          new Date('2021-12-31T00:00:00.000Z'),
          new Date('2022-01-02T00:00:00.000Z'),
        );
        assertEquals(guardian(date), date);
        assertThrows(() => guardian('2029-01-02T00:00:00.000Z'), GuardianError);
      },
    });

    it({
      name: 'DateGuardian - Test gt',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().gt(
          new Date('2021-12-31T00:00:00.000Z'),
        );
        assertEquals(guardian(date), date);
        assertThrows(
          () => guardian(new Date('1999-01-02T00:00:00.000Z')),
          GuardianError,
        );
      },
    });

    it({
      name: 'DateGuardian - Test lt',
      fn(): void {
        const date = new Date('2022-01-01T00:00:00.000Z');
        const guardian = Guardian.date().lt(
          new Date('2022-01-02T00:00:00.000Z'),
        );
        assertEquals(guardian(date), date);
        assertThrows(
          () => guardian(new Date('2025-12-31T00:00:00.000Z')),
          GuardianError,
        );
      },
    });
  });
});
