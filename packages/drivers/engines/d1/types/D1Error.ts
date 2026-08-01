/**
 * @fileoverview Cloudflare D1 REST error / message envelope entries.
 *
 * @module
 */

/**
 * An entry of the `errors` array in a Cloudflare D1 REST response.
 *
 * Cloudflare's envelope reports failures as `{ code, message }` objects. `code`
 * is Cloudflare's **numeric** API/D1 error code (e.g. `7500`), not the SQLite
 * `SQLITE_*` string — the SQLite-style detail (e.g.
 * `UNIQUE constraint failed: t.email`) lives in `message`, which is what the
 * forthcoming `D1Engine` maps via the shared `sqliteErrorToCode` /
 * `parseSqliteErrorMeta` helpers. Both are surfaced on {@link D1HttpError}.
 */
export type D1Error = {
  /** Cloudflare numeric API/D1 error code. */
  code?: number;

  /** Human-readable (SQLite-style, for query failures) error message. */
  message: string;
};

/**
 * An entry of the `messages` array in a Cloudflare D1 REST response.
 *
 * Shares the `{ code, message }` shape of {@link D1Error} but carries
 * informational messages rather than failures; the client does not act on it.
 */
export type D1Message = {
  /** Cloudflare numeric message code. */
  code?: number;

  /** Human-readable message text. */
  message: string;
};
