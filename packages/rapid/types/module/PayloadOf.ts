/**
 * @fileoverview {@link RapidModulePayloadOf} — extract the payload type
 * from a {@link RapidModulePayload} marker (what `emit` and subscribers
 * are typed against).
 *
 * @module
 */

import type { RapidModulePayload } from './Payload.ts';

/** `RapidModulePayload<T>` → `T`. */
export type RapidModulePayloadOf<P> = P extends RapidModulePayload<infer T> ? T
  : never;
