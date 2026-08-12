/**
 * @fileoverview {@link ParsedSchedule} — the compiled form of a cron
 * expression.
 *
 * @module
 */

/**
 * One parsed schedule — a value set per field, plus restriction flags.
 * Produced by `parseSchedule`, consumed by `matches`.
 */
export type ParsedSchedule = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  /** `true` when the field was not `*` (drives the POSIX dom/dow OR). */
  domRestricted: boolean;
  dowRestricted: boolean;
};
