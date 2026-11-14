/**
 * @fileoverview The UTC session rule shared by `PostgresEngine` and
 * `NeonHttpEngine`. Pure and socket-free, so the edge-safe `./neon` graph can
 * import it.
 *
 * @module
 */

/** `TimeZone` values Postgres reports for UTC, compared case-insensitively. */
export const UTC_ZONE =
  /^(?:etc\/)?(?:utc|uct|universal|zulu|greenwich|gmt(?:[+-]?0)?)$/i;

/** The `reason` both engines give for refusing a session in `zone`. */
export function nonUtcReason(zone: string): string {
  return `the database session runs in ${zone}, not UTC; ` +
    `run ALTER DATABASE <name> SET timezone TO 'UTC', ` +
    `or pass allowNonUtcTimeZone: true to accept it`;
}
