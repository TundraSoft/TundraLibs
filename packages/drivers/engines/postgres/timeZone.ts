/**
 * @fileoverview The UTC session rule shared by `PostgresEngine` and
 * `NeonHttpEngine`. Pure and socket-free, so the edge-safe `./neon` graph can
 * import it.
 *
 * @module
 */

/**
 * `TimeZone` values that are a fixed zero offset, compared case-insensitively:
 * the tz database names for UTC and GMT, `Factory`, and a POSIX spec with a
 * zero offset and no daylight part (`UTC0`, `+00:00`, `<+00>-00`). A regional
 * zone that sits at zero today, such as `Africa/Abidjan`, does not match.
 */
export const UTC_ZONE =
  /^(?:(?:etc\/)?(?:utc|uct|universal|zulu|greenwich|gmt)|factory|(?:<[^>]*>|[^\d,+-]*)[+-]?0+(?::0+){0,2})$/i;

/** The `reason` both engines give for refusing a session in `zone`. */
export function nonUtcReason(zone: string): string {
  return `the database session runs in ${zone}, not UTC; ` +
    `set timezone to 'UTC' with ALTER ROLE, or with ALTER DATABASE when ` +
    `the role has no setting of its own, ` +
    `or pass allowNonUtcTimeZone: true to accept it`;
}
