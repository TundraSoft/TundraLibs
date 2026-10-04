/**
 * @fileoverview {@link RapidComposeOptions} — the `compose` route option:
 * the named parts a page is made of.
 *
 * @module
 */

import type { RapidComposePart } from './ComposePart.ts';

/**
 * Slot name → the part that fills it: an action string
 * (`'namespace:Module:method'`) or the long form. Every part runs
 * in-process under the page's request — one authentication, one request
 * — and lands in the reply's `content.parts[name]` as a
 * {@link RapidComposeSlot}. The declared set is capped by
 * `ui.compose.maxParts`.
 */
export type RapidComposeOptions = Readonly<
  Record<string, string | RapidComposePart>
>;
