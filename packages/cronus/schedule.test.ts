/**
 * @fileoverview The cron engine — field parsing (wildcards, ranges,
 * steps, lists, names), the fixes over the naive predecessor (month
 * off-by-one, dow=7, `-5` rejection), and POSIX dom/dow OR matching.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { isValidSchedule, matches, parseSchedule } from './mod.ts';
import { InvalidScheduleError } from './errors/mod.ts';

/** A local Date at the given wall-clock parts (matcher reads local time). */
const at = (
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
) => new Date(y, mo - 1, d, h, mi);

describe('cronus.schedule', () => {
  describe('parsing', () => {
    it('expands * to the full field range', () => {
      const s = parseSchedule('* * * * *');
      asserts.assertEquals(s.minute.size, 60);
      asserts.assertEquals(s.hour.size, 24);
      asserts.assertEquals(s.dayOfMonth.size, 31);
      asserts.assertEquals(s.month.size, 12);
      asserts.assertEquals(s.dayOfWeek.size, 7);
    });

    it('handles ranges, lists, and steps', () => {
      asserts.assertEquals([...parseSchedule('1-5 * * * *').minute], [
        1,
        2,
        3,
        4,
        5,
      ]);
      asserts.assertEquals([...parseSchedule('0,15,30,45 * * * *').minute], [
        0,
        15,
        30,
        45,
      ]);
      asserts.assertEquals([...parseSchedule('*/15 * * * *').minute], [
        0,
        15,
        30,
        45,
      ]);
      asserts.assertEquals([...parseSchedule('10-20/5 * * * *').minute], [
        10,
        15,
        20,
      ]);
      // bare-number-with-step: 5/10 = 5,15,25,... to max
      asserts.assertEquals([...parseSchedule('5/10 * * * *').minute], [
        5,
        15,
        25,
        35,
        45,
        55,
      ]);
    });

    it('expands month and day NAMES (case-insensitive)', () => {
      asserts.assertEquals([...parseSchedule('0 0 * jan,dec *').month], [
        1,
        12,
      ]);
      asserts.assertEquals([...parseSchedule('0 0 * * MON-FRI').dayOfWeek], [
        1,
        2,
        3,
        4,
        5,
      ]);
    });

    it('accepts BOTH 0 and 7 for Sunday, folding 7 → 0', () => {
      asserts.assertEquals([...parseSchedule('0 0 * * 7').dayOfWeek], [0]);
      asserts.assertEquals([...parseSchedule('0 0 * * 0').dayOfWeek], [0]);
      asserts.assertEquals([...parseSchedule('0 0 * * 0-7').dayOfWeek], [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
      ]);
    });

    it('rejects malformed fields loudly', () => {
      const bad = [
        '* * * *', // 4 fields
        '60 * * * *', // minute out of range
        '* 24 * * *', // hour out of range
        '*/0 * * * *', // zero step
        '-5 * * * *', // the naive predecessor silently read this as 0-5
        '5- * * * *', // half range
        '5-1 * * * *', // reversed range
        '1/2/3 * * * *', // double step
        '* * * FOO *', // unknown name
        '', // empty
        '0 0 * JAN1 *', // name glued to a digit — NOT November
        '0 0 * 1JAN *', // digit glued to a name
        '0 0 * * SUN1', // day name glued to a digit
        '*/60 * * * *', // step exceeds the field span
        '*/ * * * *', // missing step
        '/5 * * * *', // missing value before step
        '0 0 * * SAT-SUN', // wrapping name range (6-0)
        '0 0 * MAY-JAN *', // wrapping month range
      ];
      for (const expr of bad) {
        asserts.assertThrows(
          () => parseSchedule(expr),
          InvalidScheduleError,
          undefined,
          `expected '${expr}' to throw`,
        );
        asserts.assertEquals(isValidSchedule(expr), false);
      }
    });

    it('step-span boundary: real spans reject, degenerate spans accept', () => {
      // Accepting side of the cut — one typo away from regressing.
      asserts.assertEquals([...parseSchedule('*/59 * * * *').minute], [0, 59]);
      asserts.assertEquals([...parseSchedule('0/59 * * * *').minute], [0, 59]);
      asserts.assertEquals([...parseSchedule('0 0 * */11 *').month], [1, 12]);
      asserts.assertEquals([...parseSchedule('0 0 * * */7').dayOfWeek], [0]);
      // Degenerate single-value spans: a step is a no-op, not an error.
      asserts.assertEquals([...parseSchedule('59/1 * * * *').minute], [59]);
      asserts.assertEquals([...parseSchedule('0-0/1 * * * *').minute], [0]);
      asserts.assertEquals([...parseSchedule('59/60 * * * *').minute], [59]);
      // Real spans one past the edge still reject.
      asserts.assertEquals(isValidSchedule('*/60 * * * *'), false);
      asserts.assertEquals(isValidSchedule('0 0 * */12 *'), false);
    });

    it('out-of-range bare atom with a step blames the ATOM, not the step', () => {
      try {
        parseSchedule('99/2 * * * *');
        asserts.fail('should have thrown');
      } catch (e) {
        const err = e as InvalidScheduleError;
        asserts.assert(
          String(err.context.reason).includes("'99' outside 0-59"),
        );
      }
    });

    it('names in name-less fields get the whole-number error', () => {
      try {
        parseSchedule('MON * * * *');
        asserts.fail('should have thrown');
      } catch (e) {
        const err = e as InvalidScheduleError;
        asserts.assert(String(err.context.reason).includes('whole number'));
        asserts.assertEquals(err.context.field, 'minute');
      }
    });

    it('mixed name/number atoms parse Vixie-style', () => {
      asserts.assertEquals([...parseSchedule('0 0 * * SUN-1').dayOfWeek], [
        0,
        1,
      ]);
      asserts.assertEquals([...parseSchedule('0 0 * * 0-SAT/2').dayOfWeek], [
        0,
        2,
        4,
        6,
      ]);
    });

    it('carries expression/field/reason in the error context', () => {
      try {
        parseSchedule('0 0 * * SAT-SUN');
        asserts.fail('should have thrown');
      } catch (e) {
        const err = e as InvalidScheduleError;
        asserts.assertEquals(err.context.expression, '0 0 * * SAT-SUN');
        asserts.assertEquals(err.context.field, 'day-of-week');
        // The reason names the ORIGINAL token and explains the rule.
        asserts.assert(String(err.context.reason).includes('SAT-SUN'));
        asserts.assert(String(err.context.reason).includes('do not wrap'));
      }
    });

    it('isValidSchedule true-branch; validity is syntactic only', () => {
      asserts.assertEquals(isValidSchedule('59 23 31 12 7'), true);
      // Impossible dates parse as valid — they just never match.
      asserts.assertEquals(isValidSchedule('0 0 30 2 *'), true);
      asserts.assertEquals(isValidSchedule('* * 31 4 *'), true);
    });
  });

  describe('matching', () => {
    it('matches minute/hour/day/month correctly (month is 1-based)', () => {
      const s = parseSchedule('30 6 15 1 *'); // 06:30 on Jan 15
      asserts.assert(matches(s, at(2026, 1, 15, 6, 30)));
      asserts.assert(!matches(s, at(2026, 1, 15, 6, 31)));
      // January, NOT December — the off-by-one the predecessor had.
      asserts.assert(!matches(s, at(2026, 12, 15, 6, 30)));
    });

    it('day-of-week matches the right day', () => {
      const s = parseSchedule('0 0 * * 1'); // Monday
      asserts.assert(matches(s, at(2026, 8, 17, 0, 0))); // 2026-08-17 is Monday
      asserts.assert(!matches(s, at(2026, 8, 18, 0, 0))); // Tuesday
    });

    it('POSIX: both dom AND dow restricted → OR', () => {
      const s = parseSchedule('0 0 13 * 5'); // 13th OR any Friday
      asserts.assert(matches(s, at(2026, 8, 13, 0, 0))); // the 13th (a Thu)
      asserts.assert(matches(s, at(2026, 8, 14, 0, 0))); // a Friday (not 13th)
      asserts.assert(!matches(s, at(2026, 8, 12, 0, 0))); // neither
    });

    it('one restricted, one * → AND (only the restricted one counts)', () => {
      const dom = parseSchedule('0 0 15 * *'); // 15th, any weekday
      asserts.assert(matches(dom, at(2026, 8, 15, 0, 0)));
      asserts.assert(!matches(dom, at(2026, 8, 16, 0, 0)));
    });

    it('star-flag list cliff: *,5 unrestricted vs 5,* restricted', () => {
      // Identical SETS, different flags — Vixie's first-char rule.
      const starFirst = parseSchedule('0 0 *,5 * 1');
      const starLater = parseSchedule('0 0 5,* * 1');
      asserts.assertEquals(starFirst.domRestricted, false);
      asserts.assertEquals(starLater.domRestricted, true);
      const tue = at(2026, 8, 18, 0, 0); // Tuesday, not the 5th
      asserts.assert(!matches(starFirst, tue)); // AND → Mondays only
      asserts.assert(matches(starLater, tue)); // OR → every day
    });

    it('minute resolution: seconds/millis are ignored', () => {
      const s = parseSchedule('30 6 * * *');
      const withSeconds = new Date(2026, 0, 1, 6, 30, 59, 999);
      const justBefore = new Date(2026, 0, 1, 6, 29, 59, 999);
      asserts.assert(matches(s, withSeconds));
      asserts.assert(!matches(s, justBefore));
    });

    it('Vixie star-flag: */n counts as UNrestricted → AND, not OR', () => {
      // "every day-of-month step" + Monday = Mondays only (Vixie),
      // NOT every day (which the naive not-'*' flag would produce).
      const s = parseSchedule('0 0 */1 * 1');
      asserts.assertEquals(s.domRestricted, false);
      asserts.assertEquals(s.dowRestricted, true);
      asserts.assert(matches(s, at(2026, 8, 17, 0, 0))); // Monday
      asserts.assert(!matches(s, at(2026, 8, 18, 0, 0))); // Tuesday — must NOT fire
    });

    it('dow 7 matches a real Sunday date', () => {
      const s = parseSchedule('0 0 * * 7');
      asserts.assert(matches(s, at(2026, 8, 16, 0, 0))); // 2026-08-16 is Sunday
      asserts.assert(!matches(s, at(2026, 8, 17, 0, 0)));
    });

    it('full-coverage restricted dow still ORs (POSIX footgun, pinned)', () => {
      // '0-6' is "restricted" though it covers every day → the OR arm
      // always matches → fires daily. Standard cron behaves the same.
      const s = parseSchedule('0 0 13 * 0-6');
      asserts.assert(matches(s, at(2026, 8, 14, 0, 0))); // not the 13th
    });

    it('impossible dates never match anything', () => {
      const s = parseSchedule('* * 31 4 *'); // April 31
      for (let d = 1; d <= 30; d++) {
        asserts.assert(!matches(s, at(2026, 4, d, 12, 0)));
      }
    });
  });
});
