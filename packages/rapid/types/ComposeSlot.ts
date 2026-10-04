/**
 * @fileoverview {@link RapidComposeSlot} — what a composed page's template
 * (or an API client) finds under `content.parts[name]`.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';

/**
 * One composed part's outcome. On the ui surface a part is MARKUP: the
 * target's own template rendered around its reply, or the app's error
 * template for a denied/failed part, wrapped in `<div data-part="name">`
 * so the client runtime can place a deferred result; a deferred part is
 * the placeholder that triggers that fetch. On the api surface (and for
 * a target with no template) it is the DATA envelope. A denied or failed
 * part never carries its content — only the status and the generic
 * envelope the API would have answered.
 */
export type RapidComposeSlot = {
  /** The part's outcome: the target's status, 403 denied, 504 timed out, 202 deferred. */
  status: number;
  /** The part's markup (ui surface); absent on the api surface and for untemplated targets. */
  html?: Html;
  /** The part's reply content (api surface / untemplated), or the error envelope. */
  content?: unknown;
  /** Present on a part left to the follow-up fetch. */
  deferred?: true;
};
