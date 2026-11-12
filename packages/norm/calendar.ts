/**
 * @module
 * Day and time-of-day values norm stores itself. A `date()` value is a
 * UTC calendar day, a `time()` value an `HH:MM:SS` string. Postgres and
 * MariaDB store both natively; SQLite, Mongo and encrypted columns hold
 * what norm writes, so norm reduces the value before it is stored and
 * again when it is read back (rows written by earlier versions).
 */

const DAY_MS = 86_400_000;

/** `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` (1–6 fraction digits), from
 * `00:00` to `23:59:59.999999`. */
const TIME_OF_DAY =
  /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/;

/** A full ISO instant — a `time()` value SQLite or Mongo stored before
 * time-of-day strings. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T/;

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
