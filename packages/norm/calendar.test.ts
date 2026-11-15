import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  asUtc,
  readTimeOfDay,
  toTimeOfDay,
  utcDay,
  zonedDay,
  zonedInstant,
  zonedTimeOfDay,
} from './calendar.ts';
import { NormError } from './errors/mod.ts';

const at = (iso: string) => new Date(iso);
const codeOf = (f: () => unknown) => asserts.assertThrows(f, NormError).code;

describe('norm.calendar', () => {
  it('asUtc: a date-time that names no offset is marked UTC', () => {
    const marked: string = asUtc('2026-01-15T10:00:00');
    asserts.assertEquals(marked, '2026-01-15T10:00:00Z');
    asserts.assertEquals(asUtc('2026-01-15 10:00:00'), '2026-01-15T10:00:00Z');
    asserts.assertEquals(asUtc('2026-01-15T10:00'), '2026-01-15T10:00Z');
    asserts.assertEquals(
      asUtc('2026-01-15T10:00:00.123456'),
      '2026-01-15T10:00:00.123Z',
    );
  });

  it('asUtc: anything else comes back as it came', () => {
    const others = [
      '2026-01-15T10:00:00Z',
      '2026-01-15T10:00:00+05:30',
      '2026-01-15T10:00:00-0800',
      '2026-01-15',
      'Thu, 15 Jan 2026 10:00:00',
      '2026-01-15T10:00:001',
      '',
      1768471200000,
      null,
      new Date(0),
    ];
    for (const v of others) asserts.assertStrictEquals(asUtc(v), v, String(v));
  });

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

  it('zonedDay: the calendar day in the zone, as UTC midnight', () => {
    const cases: [string, string, string][] = [
      ['2026-11-14T20:00:00Z', 'Asia/Kolkata', '2026-11-15'],
      ['2026-11-14T18:29:59.999Z', 'Asia/Kolkata', '2026-11-14'],
      // 04:30Z is 00:30 in New York in summer and 23:30 in winter.
      ['2026-07-01T04:30:00Z', 'America/New_York', '2026-07-01'],
      ['2026-12-01T04:30:00Z', 'America/New_York', '2026-11-30'],
      ['2026-11-14T09:59:59Z', 'Pacific/Honolulu', '2026-11-13'],
      ['2026-11-14T10:00:00Z', 'Pacific/Honolulu', '2026-11-14'],
      ['2026-11-14T23:59:59.999Z', 'UTC', '2026-11-14'],
      ['0050-06-01T20:00:00Z', 'Asia/Kolkata', '0050-06-02'],
    ];
    for (const [instant, zone, day] of cases) {
      asserts.assertEquals(
        zonedDay(at(instant), zone).toISOString(),
        `${day}T00:00:00.000Z`,
        `${instant} ${zone}`,
      );
    }
  });

  it('zonedTimeOfDay: the clock in the zone, fraction kept', () => {
    const cases: [string, string, string][] = [
      ['2026-11-14T20:00:00.250Z', 'Asia/Kolkata', '01:30:00.25'],
      ['2026-11-14T18:30:00Z', 'Asia/Kolkata', '00:00:00'],
      ['2026-07-01T04:30:00Z', 'America/New_York', '00:30:00'],
      ['2026-12-01T04:30:00Z', 'America/New_York', '23:30:00'],
      ['2026-11-14T09:59:59Z', 'Pacific/Honolulu', '23:59:59'],
      ['2026-11-14T07:05:09.120Z', 'UTC', '07:05:09.12'],
    ];
    for (const [instant, zone, time] of cases) {
      asserts.assertEquals(
        zonedTimeOfDay(at(instant), zone),
        time,
        `${instant} ${zone}`,
      );
    }
  });

  it('zonedInstant: text with no offset is the clock in the zone', () => {
    const cases: [string, string, string][] = [
      ['2026-11-14', 'Asia/Kolkata', '2026-11-13T18:30:00.000Z'],
      ['2026-11-14 01:30', 'Asia/Kolkata', '2026-11-13T20:00:00.000Z'],
      ['2026-11-14T01:30:00.2509', 'Asia/Kolkata', '2026-11-13T20:00:00.250Z'],
      ['2026-11-14', 'Pacific/Honolulu', '2026-11-14T10:00:00.000Z'],
      ['2026-11-14T23:59:59', 'UTC', '2026-11-14T23:59:59.000Z'],
      // New York: UTC-5 until 2026-03-08, UTC-4 until 2026-11-01.
      ['2026-03-08', 'America/New_York', '2026-03-08T05:00:00.000Z'],
      ['2026-03-08T01:59:59', 'America/New_York', '2026-03-08T06:59:59.000Z'],
      ['2026-03-08T03:00:00', 'America/New_York', '2026-03-08T07:00:00.000Z'],
      ['2026-03-09', 'America/New_York', '2026-03-09T04:00:00.000Z'],
      ['2026-11-01', 'America/New_York', '2026-11-01T04:00:00.000Z'],
      ['2026-11-01T02:00:00', 'America/New_York', '2026-11-01T07:00:00.000Z'],
      ['2026-11-02', 'America/New_York', '2026-11-02T05:00:00.000Z'],
    ];
    for (const [text, zone, instant] of cases) {
      asserts.assertEquals(
        zonedInstant(text, zone).toISOString(),
        instant,
        `${text} ${zone}`,
      );
    }
  });

  it('zonedInstant: a skipped time moves forward, a repeated one is the earlier', () => {
    asserts.assertEquals(
      zonedInstant('2026-03-08T02:30:00', 'America/New_York').toISOString(),
      '2026-03-08T07:30:00.000Z',
    );
    asserts.assertEquals(
      zonedInstant('2026-11-01T01:30:00', 'America/New_York').toISOString(),
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('zonedInstant: text that names an offset keeps it', () => {
    asserts.assertEquals(
      zonedInstant('2026-11-14T10:00:00+05:30', 'America/New_York')
        .toISOString(),
      '2026-11-14T04:30:00.000Z',
    );
    asserts.assertEquals(
      zonedInstant('2026-11-14 10:00Z', 'Asia/Kolkata').toISOString(),
      '2026-11-14T10:00:00.000Z',
    );
  });

  it('zoned helpers: an unknown zone is INVALID_TIME_ZONE', () => {
    for (const zone of ['Mars/Olympus', '']) {
      asserts.assertEquals(
        codeOf(() => zonedDay(at('2026-11-14T00:00:00Z'), zone)),
        'INVALID_TIME_ZONE',
      );
      asserts.assertEquals(
        codeOf(() => zonedTimeOfDay(at('2026-11-14T00:00:00Z'), zone)),
        'INVALID_TIME_ZONE',
      );
      asserts.assertEquals(
        codeOf(() => zonedInstant('2026-11-14T00:00:00Z', zone)),
        'INVALID_TIME_ZONE',
      );
    }
  });

  it('zoned helpers: an Invalid Date or text that is no date is INVALID_DATE', () => {
    asserts.assertEquals(
      codeOf(() => zonedDay(at('nope'), 'UTC')),
      'INVALID_DATE',
    );
    asserts.assertEquals(
      codeOf(() => zonedTimeOfDay(at('nope'), 'UTC')),
      'INVALID_DATE',
    );
    const texts = [
      'nope',
      '',
      '2026-02-30',
      '2026-11-14T24:00:00',
      '2026-11-14T25:00:00',
      '2026-11-14T10:00:00+25:00',
      '14 Nov 2026',
      '2026-11-14T',
    ];
    for (const text of texts) {
      asserts.assertEquals(
        codeOf(() => zonedInstant(text, 'Asia/Kolkata')),
        'INVALID_DATE',
        text,
      );
    }
  });
});
