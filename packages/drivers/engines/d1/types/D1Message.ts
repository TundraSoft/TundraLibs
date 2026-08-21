/**
 * @fileoverview Cloudflare D1 REST `messages` envelope entry.
 *
 * @module
 */

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
