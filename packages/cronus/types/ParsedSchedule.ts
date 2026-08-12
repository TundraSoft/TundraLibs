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
  /**
   * `true` when the minute AND hour fields are both concrete (neither
   * starts with `*`) — a "fixed-time" job in Vixie cron's sense:
   * "once per day at this wall time". Fixed-time jobs are fired at
   * most once per wall-clock minute, so a DST fall-back's repeated
   * hour cannot double-fire them; wildcard jobs (`* * * * *` and
   * step-on-wildcard forms) keep firing every physical minute.
   */
  fixedTime: boolean;
};
