/**
 * @fileoverview {@link RapidModuleEventMap} — the shape of a module's
 * `events` declaration: leaf event name → payload marker.
 *
 * @module
 */

import type { RapidModulePayload } from './Payload.ts';

/** Leaf event name (`PostCreated`) → {@link RapidModulePayload}. */
export type RapidModuleEventMap = Readonly<
  Record<string, RapidModulePayload<unknown>>
>;
