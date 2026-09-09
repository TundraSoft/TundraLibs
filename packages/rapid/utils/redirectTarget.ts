/**
 * @fileoverview The one redirect-target rule, shared by the navigation
 * path (`ctx.response` setter) and the swap path (`represent()`'s
 * redirect header) so a BYO client that follows the header verbatim
 * (htmx's `HX-Redirect`) is protected server-side too.
 * @module
 */

import { RapidError } from '../errors/mod.ts';

/** A target with an explicit scheme — the author's deliberate, untouched choice. */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Refuse a redirect target a browser would resolve to ANOTHER origin
 * although it was written as a path. Decided the way the browser decides —
 * resolve against a sentinel origin and see whether the host survived —
 * not with a leading-character regex: the WHATWG parser strips ASCII
 * tab/newline and leading controls BEFORE parsing, so `/\t/evil.example`
 * and `' //evil.example'` are `//evil.example` to the browser.
 *
 * @throws {RapidError} RAPID_RESPONSE_INVALID when the target leaves the
 *   sentinel origin (`//host`, `/\host`, `/\t/host`, …).
 */
export function assertRedirectTarget(url: string): void {
  if (ABSOLUTE_URL.test(url)) return;
  let host = '';
  try {
    host = new URL(url, 'https://rapid.invalid').host;
  } catch {
    // unparsable: falls through to the throw below
  }
  if (host !== 'rapid.invalid') {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message:
        'redirect target resolves to another origin although it is not a full URL (a scheme-relative //host form) — write the full https://… URL to redirect cross-origin on purpose',
      details: { url },
    });
  }
}
