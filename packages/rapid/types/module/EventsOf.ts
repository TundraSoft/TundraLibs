/**
 * @fileoverview {@link RapidModuleEventsOf} — the event map a module class
 * was declared with, inferred from its base type argument (works through
 * the protected `events` member).
 *
 * @module
 */

import type { RapidModule } from '../../modules/RapidModule.ts';

/** `M extends RapidModule<E>` → `E`. */
export type RapidModuleEventsOf<M> = M extends RapidModule<infer E> ? E
  : never;
