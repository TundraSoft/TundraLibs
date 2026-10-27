/**
 * @fileoverview Tests for RFC 5322 date parsing.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { parseDate } from './dates.ts';

describe('parseDate', () => {
  const cases: [string, string | undefined][] = [
    ['Mon, 26 Oct 2026 10:15:30 +0100', '2026-10-26T09:15:30.000Z'],
    ['26 Oct 2026 10:15 -0530', '2026-10-26T15:45:00.000Z'],
    ['Tue, 27 Oct 26 00:00:00 GMT', '2026-10-27T00:00:00.000Z'],
    ['Wed, 1 Jul 2026 12:00:00 EDT', '2026-07-01T16:00:00.000Z'],
    ['Thu, 2 Jul 2026 12:00:00 XYZ', '2026-07-02T12:00:00.000Z'],
    ['Fri, 3 Jul 2026 12:00:00 +0000 (UTC)', '2026-07-03T12:00:00.000Z'],
    ['2026-07-04T08:00:00Z', '2026-07-04T08:00:00.000Z'],
    ['not a date at all', undefined],
    ['', undefined],
  ];
  for (const [input, expected] of cases) {
    it(`should parse ${JSON.stringify(input)}`, () => {
      asserts.assertEquals(parseDate(input)?.toISOString(), expected);
    });
  }
});
