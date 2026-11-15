/**
 * @module
 * Day and time-of-day values norm stores itself. A `date()` value is a
 * UTC calendar day, a `time()` value an `HH:MM:SS` string. Postgres and
 * MariaDB store both natively; SQLite, Mongo and encrypted columns hold
 * what norm writes, so norm reduces the value before it is stored and
 * again when it is read back (rows written by earlier versions).
 */

import { NormError } from './errors/mod.ts';

const DAY_MS = 86_400_000;

/** `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` (1–6 fraction digits), from
 * `00:00` to `23:59:59.999999`. */
const TIME_OF_DAY =
  /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/;

/** A full ISO instant — a `time()` value SQLite or Mongo stored before
 * time-of-day strings. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T/;

/** A date, then `T` or a space, then `HH:MM[:SS[.f]]`, and no offset. */
const ZONELESS_DATETIME =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:(\.\d{1,3})\d*)?$/;

/** `YYYY-MM-DD`, then optionally a time as in {@link ZONELESS_DATETIME}
 * and `Z` or a `+HH:MM` offset. */
const DATE_TEXT =
  /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(?:(\.\d{1,3})\d*)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/;

/**
 * A date-time string that names no offset, marked as UTC; anything else
 * as it came. Left unmarked, `new Date()` reads it in the host's zone,
 * so the same string would be a different instant on another host.
 */
export function asUtc(v: string): string;
/** A value that is not a string comes back as it came. */
export function asUtc(v: unknown): unknown;
export function asUtc(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const m = ZONELESS_DATETIME.exec(v);
  return m === null ? v : `${m[1]}T${m[2]}${m[3] ?? ''}Z`;
}

/** UTC midnight of the day `d` falls on. */
export function utcDay(d: Date): Date {
  const ms = d.getTime();
  return new Date(ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS));
}

function clock(h: string, m: string, s = '00', fraction = ''): string {
  let end = fraction.length;
  while (end > 0 && fraction[end - 1] === '0') end--;
  const f = fraction.slice(0, end);
  return f === '' ? `${h}:${m}:${s}` : `${h}:${m}:${s}.${f}`;
}

/**
 * The canonical `time()` value of a write: `'HH:MM:SS'`, with the
 * fraction only when it is non-zero. A `Date` contributes its UTC clock.
 * `undefined` when `v` is neither a time-of-day string nor a valid
 * `Date`.
 */
export function toTimeOfDay(v: unknown): string | undefined {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    const iso = v.toISOString();
    return clock(
      iso.slice(11, 13),
      iso.slice(14, 16),
      iso.slice(17, 19),
      iso.slice(20, 23),
    );
  }
  if (typeof v !== 'string') return undefined;
  const m = TIME_OF_DAY.exec(v);
  return m === null ? undefined : clock(m[1]!, m[2]!, m[3], m[4]);
}

/**
 * A stored `time()` value as read: canonicalized when it is a time of
 * day, a `Date` or an ISO instant (older SQLite/Mongo rows); anything
 * else — a MariaDB duration such as `'100:00:00'` — as it came.
 */
export function readTimeOfDay(v: unknown): unknown {
  if (typeof v === 'string' && ISO_INSTANT.test(v)) {
    return toTimeOfDay(new Date(v)) ?? v;
  }
  return toTimeOfDay(v) ?? v;
}

function invalidDate(message: string): NormError {
  return new NormError(message, { code: 'INVALID_DATE' });
}

function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch (cause) {
    throw new NormError(
      `Unknown time zone '${timeZone}'.`,
      { code: 'INVALID_TIME_ZONE' },
      cause as Error,
    );
  }
}

/** The calendar and clock `zone` shows at the instant `ms`, as the UTC
 * instant that reads the same. */
function wallClock(zone: Intl.DateTimeFormat, ms: number): number {
  const part: Record<string, number> = {};
  for (const { type, value } of zone.formatToParts(ms)) {
    part[type] = Number(value);
  }
  // Not `Date.UTC`, which reads a year below 100 as 19xx.
  const wall = new Date(0);
  wall.setUTCFullYear(part.year!, part.month! - 1, part.day);
  wall.setUTCHours(
    part.hour!,
    part.minute,
    part.second,
    ((ms % 1000) + 1000) % 1000,
  );
  return wall.getTime();
}

function zoned(d: Date, timeZone: string): Date {
  const zone = zoneFormat(timeZone);
  const ms = d.getTime();
  if (Number.isNaN(ms)) throw invalidDate('Expected a valid Date.');
  return new Date(wallClock(zone, ms));
}

/**
 * The calendar day `d` falls on in `timeZone`, as the UTC midnight a
 * `date()` column stores: `2026-11-14T20:00:00Z` in `Asia/Kolkata` is
 * `2026-11-15T00:00:00.000Z`.
 *
 * @param timeZone An IANA zone name such as `America/New_York`.
 * @throws {NormError} `INVALID_TIME_ZONE` when the runtime does not know
 *   `timeZone`; `INVALID_DATE` when `d` is an Invalid Date.
 */
export function zonedDay(d: Date, timeZone: string): Date {
  return utcDay(zoned(d, timeZone));
}

/**
 * The clock time of `d` in `timeZone`, in the form a `time()` column
 * stores: `'HH:MM:SS'`, with the fraction only when it is non-zero.
 *
 * @param timeZone An IANA zone name such as `America/New_York`.
 * @throws {NormError} `INVALID_TIME_ZONE` when the runtime does not know
 *   `timeZone`; `INVALID_DATE` when `d` is an Invalid Date.
 */
export function zonedTimeOfDay(d: Date, timeZone: string): string {
  return toTimeOfDay(zoned(d, timeZone))!;
}

/**
 * The instant at which the clock in `timeZone` reads `text`:
 * `'2026-11-14'` in `Asia/Kolkata` is `2026-11-13T18:30:00.000Z`. `text`
 * is `YYYY-MM-DD`, alone for midnight or followed by `T` or a space and
 * `HH:MM[:SS[.fff]]`. Text that ends in `Z` or a `+HH:MM` offset keeps
 * that offset and `timeZone` is not applied.
 *
 * A time the zone's clock skips is moved forward by the length of the
 * skip, and a time it shows twice is the earlier instant, as with
 * Temporal's `compatible` disambiguation.
 *
 * @param timeZone An IANA zone name such as `America/New_York`.
 * @throws {NormError} `INVALID_TIME_ZONE` when the runtime does not know
 *   `timeZone`; `INVALID_DATE` when `text` has another form or names a
 *   day or time no calendar has, such as `2026-02-30` or `25:00`.
 */
export function zonedInstant(text: string, timeZone: string): Date {
  const zone = zoneFormat(timeZone);
  const m = DATE_TEXT.exec(text);
  const invalid = `'${text}' is not a date or date-time.`;
  if (m === null) throw invalidDate(invalid);
  const stamp = `${m[1]}T${m[2] ?? '00:00'}${m[3] ?? ''}`;
  const wall = new Date(`${stamp}Z`).getTime();
  // An engine that rolls `02-30` over to March would otherwise accept it.
  if (
    Number.isNaN(wall) || new Date(wall).toISOString().slice(0, 10) !== m[1]
  ) {
    throw invalidDate(invalid);
  }
  if (m[4] !== undefined) return new Date(stamp + m[4]);
  // The zone's offset a day either side: equal away from a clock change,
  // otherwise the offsets before and after it.
  const before = wallClock(zone, wall - DAY_MS) - (wall - DAY_MS);
  const after = wallClock(zone, wall + DAY_MS) - (wall + DAY_MS);
  const a = wall - before;
  const b = wall - after;
  return new Date(
    wallClock(zone, b) === wall && wallClock(zone, a) !== wall ? b : a,
  );
}
