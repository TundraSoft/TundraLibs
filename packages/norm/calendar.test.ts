import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { readTimeOfDay, toTimeOfDay, utcDay } from './calendar.ts';

describe('norm.calendar', () => {
  it('utcDay: UTC midnight of the day, before and after the epoch', () => {
    asserts.assertEquals(
      utcDay(new Date('2026-01-15T23:30:00.250Z')).toISOString(),
      '2026-01-15T00:00:00.000Z',
    );
    asserts.assertEquals(
      utcDay(new Date('1969-12-31T23:00:00Z')).toISOString(),
      '1969-12-31T00:00:00.000Z',
    );
  });

  it('toTimeOfDay: canonical HH:MM:SS, fraction only when non-zero', () => {
    asserts.assertEquals(toTimeOfDay('10:30'), '10:30:00');
    asserts.assertEquals(toTimeOfDay('23:59:59'), '23:59:59');
    asserts.assertEquals(toTimeOfDay('10:30:00.250'), '10:30:00.25');
    asserts.assertEquals(toTimeOfDay('10:30:00.000000'), '10:30:00');
    asserts.assertEquals(
      toTimeOfDay(new Date('2026-01-15T07:05:09.120Z')),
      '07:05:09.12',
    );
  });

  it('toTimeOfDay: undefined for anything that is not a time of day', () => {
    for (const v of ['24:00', '9:30', '10:60', '10:30:00.1234567', '', 1030]) {
      asserts.assertEquals(toTimeOfDay(v), undefined, String(v));
    }
    asserts.assertEquals(toTimeOfDay(new Date('nope')), undefined);
  });

  it('readTimeOfDay: older ISO and Date values give their UTC clock', () => {
    asserts.assertEquals(readTimeOfDay('2026-01-15T10:30:00.000Z'), '10:30:00');
    asserts.assertEquals(
      readTimeOfDay(new Date('1970-01-01T23:45:00Z')),
      '23:45:00',
    );
    asserts.assertEquals(readTimeOfDay('10:30:00.500000'), '10:30:00.5');
  });

  it('readTimeOfDay: a value that is not a time of day comes back as is', () => {
    asserts.assertEquals(readTimeOfDay('100:00:00'), '100:00:00');
    asserts.assertEquals(readTimeOfDay('-01:00:00'), '-01:00:00');
  });
});
