/**
 * @fileoverview A header that tells a client when it may retry, paired with
 * how to read it.
 *
 * @module
 */

/**
 * How the value of a retry hint header is to be read.
 *
 * The pairing is the whole point: these headers do NOT share a format, and
 * reading one as another is not a rounding error. `X-RateLimit-Reset: 1774000000`
 * is an absolute epoch — read as a delta it would wait 56 years, while a delta
 * of `5` read as an epoch yields a negative wait and hammers the server that
 * just asked for room.
 *
 * - `DELTA_SECONDS` — seconds to wait from now, possibly fractional
 *   (`X-RateLimit-Reset-After`, `RateLimit-Reset`).
 * - `EPOCH_SECONDS` — an absolute Unix timestamp to wait until
 *   (`X-RateLimit-Reset` as GitHub and Discord send it).
 * - `HTTP_DATE` — an absolute RFC 9110 date to wait until.
 * - `AUTO` — delta or HTTP-date, decided per value. Only `Retry-After` needs
 *   this, because RFC 9110 §10.2.3 genuinely permits either form.
 */
export type RESTlerRetryHeaderFormat =
  | 'DELTA_SECONDS'
  | 'EPOCH_SECONDS'
  | 'HTTP_DATE'
  | 'AUTO';

/** A retry hint header and the format its value is written in. */
export type RESTlerRetryHeader = {
  /** Header name, matched case-insensitively. */
  readonly name: string;
  /** How to read this header's value. */
  readonly as: RESTlerRetryHeaderFormat;
};
