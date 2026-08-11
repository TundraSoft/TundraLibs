/**
 * @fileoverview The cron engine — pure, testable functions that parse a
 * 5-field expression into a {@link ParsedSchedule} and match a `Date`
 * against it. Minute resolution (`minute hour day-of-month month
 * day-of-week`); seconds and years are deliberately out of scope.
 *
 * Field support: `*`, ranges `a-b`, steps `a/n` and `*​/n` and `a-b/n`,
 * lists `a,b,c`, plus month/day NAMES (`JAN`, `MON`). Day-of-week
 * accepts both `0` and `7` for Sunday. Names must be complete tokens —
 * `JAN1` is rejected, never silently misread.
 *
 * Semantics follow POSIX/Vixie cron: when BOTH day-of-month and
 * day-of-week are restricted, a date matches if it satisfies EITHER
 * (the standard OR rule) — and, as in Vixie cron, a field beginning
 * with `*` (including `*​/n`) counts as UNrestricted for this rule.
 *
 * Validity is syntactic: an expression that can never match a real
 * date (`0 0 30 2 *` — Feb 30) parses fine and simply never fires.
 *
 * @module
 */

import { InvalidScheduleError } from './errors/mod.ts';
import type { ParsedSchedule } from './types/mod.ts';

/** Month names → 1-12 (JAN = 1). Case-insensitive on lookup. */
const MONTH_NAMES: Readonly<Record<string, number>> = Object.freeze({
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
});

/**
 * Day names → 0-6 (SUN = 0). Cron also allows `7` for Sunday; the
 * parser folds 7 → 0.
 */
const DAY_NAMES: Readonly<Record<string, number>> = Object.freeze({
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
});

type FieldName = 'minute' | 'hour' | 'day-of-month' | 'month' | 'day-of-week';

const FIELDS: ReadonlyArray<{ name: FieldName; min: number; max: number }> = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 7 }, // 7 accepted, folded to 0
];

/** Compose and throw the package's schedule error in one place. */
function fail(
  expression: string,
  field: FieldName | undefined,
  reason: string,
): never {
  throw new InvalidScheduleError(`Invalid cron schedule: ${reason}`, {
    expression,
    field,
    reason,
  });
}

/**
 * Reject anything that is not a base-10 non-negative integer string.
 * @throws {InvalidScheduleError} When `token` is not a whole number.
 */
function toInt(token: string, field: FieldName, expression: string): number {
  if (!/^\d+$/.test(token)) {
    fail(expression, field, `'${token}' is not a whole number`);
  }
  return Number(token);
}

/**
 * Resolve one atom — a complete token that is either a number or a
 * month/day NAME. Names must match the whole token: `JAN1` fails here
 * instead of silently splicing into `11`.
 *
 * @throws {InvalidScheduleError} When the token is neither.
 */
function atomValue(
  token: string,
  field: FieldName,
  expression: string,
): number {
  if (/^\d+$/.test(token)) return Number(token);
  const map = field === 'month'
    ? MONTH_NAMES
    : field === 'day-of-week'
    ? DAY_NAMES
    : undefined;
  if (map === undefined) {
    fail(expression, field, `'${token}' is not a whole number`);
  }
  const value = map[token.toUpperCase()];
  if (value === undefined) {
    fail(expression, field, `'${token}' is not a number or a valid name`);
  }
  return value;
}

/**
 * Parse a single field into its set of matching values.
 * @throws {InvalidScheduleError} On any malformed part.
 */
function parseField(
  raw: string,
  field: FieldName,
  min: number,
  max: number,
  expression: string,
): Set<number> {
  const values = new Set<number>();

  for (const part of raw.split(',')) {
    if (part === '') {
      fail(expression, field, 'empty list item');
    }
    // Split step first: `<range>/<step>`.
    const slash = part.split('/');
    if (slash.length > 2) {
      fail(expression, field, `too many '/' in '${part}'`);
    }
    const [rangePart, stepPart] = slash;
    if (stepPart === '') {
      fail(expression, field, `missing step after '/' in '${part}'`);
    }
    if (rangePart === '') {
      fail(expression, field, `missing value before '/' in '${part}'`);
    }
    let step = 1;
    if (stepPart !== undefined) {
      step = toInt(stepPart, field, expression);
      if (step < 1) {
        fail(expression, field, `step must be >= 1 (got '${stepPart}')`);
      }
    }

    let from: number;
    let to: number;
    if (rangePart === '*') {
      from = min;
      to = max;
    } else if (rangePart!.includes('-')) {
      const bounds = rangePart!.split('-');
      if (bounds.length !== 2 || bounds[0] === '' || bounds[1] === '') {
        fail(expression, field, `malformed range '${rangePart}'`);
      }
      from = atomValue(bounds[0]!, field, expression);
      to = atomValue(bounds[1]!, field, expression);
      if (from > to) {
        fail(
          expression,
          field,
          `'${rangePart}' is reversed — ranges do not wrap; use a list ` +
            `(e.g. 'SAT,SUN' instead of 'SAT-SUN')`,
        );
      }
    } else {
      // A bare atom: a single value, or the start of an open step
      // (`5/10` = 5,15,25,… up to max).
      from = atomValue(rangePart!, field, expression);
      to = stepPart !== undefined ? max : from;
    }

    if (from < min || from > max || to > max) {
      fail(expression, field, `'${rangePart}' outside ${min}-${max}`);
    }
    // Reject a step wider than a REAL span (the '*/60' typo class). A
    // degenerate single-value span ('59/1', '0-0/1') is an explicit
    // single firing — any step is a no-op there, as in Vixie cron.
    if (stepPart !== undefined && to > from && step > to - from) {
      fail(
        expression,
        field,
        `step ${step} exceeds the span of '${part}' — it would fire ` +
          `only at ${from}`,
      );
    }
    for (let v = from; v <= to; v += step) {
      // Fold day-of-week 7 → 0 (both are Sunday).
      values.add(field === 'day-of-week' && v === 7 ? 0 : v);
    }
  }
  return values;
}

/**
 * Parse a 5-field cron expression into a {@link ParsedSchedule}.
 *
 * Validity is syntactic only — an expression naming an impossible date
 * (`0 0 30 2 *`) parses successfully and simply never matches.
 *
 * @throws {InvalidScheduleError} On the wrong field count or any
 *   malformed field (out-of-range value, malformed/reversed range,
 *   step of 0 or wider than its span, unknown or digit-glued name).
 */
export function parseSchedule(expression: string): ParsedSchedule {
  if (typeof expression !== 'string' || expression.trim() === '') {
    fail(String(expression), undefined, 'schedule must be a non-blank string');
  }
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    fail(
      expression,
      undefined,
      `expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`,
    );
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = FIELDS.map((
    spec,
    i,
  ) => parseField(fields[i]!, spec.name, spec.min, spec.max, expression));
  return {
    minute: minute!,
    hour: hour!,
    dayOfMonth: dayOfMonth!,
    month: month!,
    dayOfWeek: dayOfWeek!,
    // Vixie star-flag rule: a field BEGINNING with '*' (so '*' and
    // '*/n') is unrestricted for the dom/dow OR — '0 0 */2 * 1' means
    // "every 2nd day AND Monday", not "OR Monday".
    domRestricted: !fields[2]!.startsWith('*'),
    dowRestricted: !fields[4]!.startsWith('*'),
  };
}

/**
 * Does `date` (local time, minute resolution) satisfy the
 * {@link ParsedSchedule}?
 *
 * POSIX dom/dow rule: if both are restricted, EITHER matching is enough;
 * otherwise both must match (a field beginning with `*` always counts
 * as unrestricted — the Vixie star-flag rule).
 */
export function matches(schedule: ParsedSchedule, date: Date): boolean {
  if (!schedule.minute.has(date.getMinutes())) return false;
  if (!schedule.hour.has(date.getHours())) return false;
  // getMonth() is 0-11; the month field is 1-12.
  if (!schedule.month.has(date.getMonth() + 1)) return false;

  const domOk = schedule.dayOfMonth.has(date.getDate());
  const dowOk = schedule.dayOfWeek.has(date.getDay());
  if (schedule.domRestricted && schedule.dowRestricted) {
    return domOk || dowOk; // POSIX OR
  }
  return domOk && dowOk;
}

/**
 * Validate an expression without throwing. `true` means syntactically
 * valid — NOT that the schedule will ever fire (see
 * {@link parseSchedule}).
 */
export function isValidSchedule(expression: string): boolean {
  try {
    parseSchedule(expression);
    return true;
  } catch {
    return false;
  }
}
