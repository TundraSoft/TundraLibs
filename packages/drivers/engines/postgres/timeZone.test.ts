import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { nonUtcReason, UTC_ZONE } from './timeZone.ts';

// What `SHOW TimeZone` printed on Postgres 16 after `SET timezone TO ...`, for
// settings whose UTC offset was zero in 1900, 1950, 2026 and 2040.
const ZERO_OFFSET = [
  'UTC',
  'GMT',
  'Etc/UTC',
  'Etc/UCT',
  'Etc/Universal',
  'Etc/Zulu',
  'Etc/Greenwich',
  'Etc/GMT',
  'Etc/GMT0',
  'Etc/GMT+0',
  'Etc/GMT-0',
  'Factory',
  'GMT0',
  'GMT+0',
  'GMT-0',
  'GMT+00',
  'GMT-00:00',
  'UTC0',
  'UTC+0',
  'UTC-0',
  'UTC+00',
  'UTC+00:00',
  'UTC-00:00:00',
  'UTC 0',
  'Z0',
  'ETC/GMT+00',
  '+00:00',
  '-00:00',
  '00:00',
  '+00:00:00',
  '<+00>-00', // SET timezone TO 0
  '<+00>0',
  '<-00>0',
  '<UTC>0',
];

// tz database links to `Etc/UTC` and `Etc/GMT` that newer tzdata packages
// leave out, so the probe server did not have them.
const LEGACY_LINKS = ['UCT', 'Universal', 'Zulu', 'Greenwich'];

// Same probe: a non-zero offset at one of the four instants, or a zone that
// only sits at zero (regional, or the host's own `localtime`).
const NOT_FIXED_ZERO = [
  'Asia/Kolkata',
  'Europe/London',
  'Africa/Abidjan',
  'Africa/Lome',
  'Atlantic/Reykjavik',
  'localtime',
  'Etc/GMT+1',
  'Etc/GMT+10',
  'Etc/GMT-10',
  'GMT+1',
  'GMT+10',
  'UTC+5',
  'UTC-1',
  'UTC10',
  'UTC0:30',
  'UTC+00:30',
  'UTC-0:01',
  '+00:30',
  '+05:30',
  '-00:01',
  '<+00>-00:30',
  '<+00>-01',
  '<+01>-01', // SET timezone TO 1
  '<+00:30>-00:30', // SET timezone TO 0.5
  'UTC0UTC', // daylight part: one hour ahead in summer
  'UTC0 ',
  'UTC0BST',
  'GMT0BST,M3.5.0/1,M10.5.0',
];

describe('drivers.postgres.timeZone', () => {
  describe('UTC_ZONE', () => {
    it('should accept every fixed zero offset spelling', () => {
      for (const zone of [...ZERO_OFFSET, ...LEGACY_LINKS]) {
        asserts.assert(UTC_ZONE.test(zone), `refused ${zone}`);
      }
    });

    it('should accept a spelling in any letter case', () => {
      asserts.assert(UTC_ZONE.test('utc'));
      asserts.assert(UTC_ZONE.test('etc/gmt'));
      asserts.assert(UTC_ZONE.test('utc0'));
    });

    it('should refuse a zone that is not a fixed zero offset', () => {
      for (const zone of [...NOT_FIXED_ZERO, '', ' UTC']) {
        asserts.assertFalse(UTC_ZONE.test(zone), `accepted "${zone}"`);
      }
    });
  });

  describe('nonUtcReason', () => {
    it('should name the zone, both places to set UTC, the opt-out and when the setting applies', () => {
      const reason = nonUtcReason('Asia/Kolkata');
      for (
        const part of [
          'Asia/Kolkata',
          'ALTER ROLE',
          'ALTER DATABASE',
          'allowNonUtcTimeZone: true',
          'applies to sessions opened after it',
          "a pooler's included, keeps its zone",
        ]
      ) {
        asserts.assertStringIncludes(reason, part);
      }
    });

    it('should not print a placeholder for the reader to fill in', () => {
      asserts.assertNotMatch(nonUtcReason('Asia/Kolkata'), /<\w+>/);
    });
  });
});
