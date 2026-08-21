/**
 * @fileoverview {@link RapidModuleEventPayload} — a subscriber's way to
 * type its parameter from the PUBLISHER's declaration without a runtime
 * import: `RapidModuleEventPayload<Posts, 'PostCreated'>` (use with
 * `import type { Posts }`, which is erased — no module import cycles).
 *
 * @module
 */

import type { RapidModule } from '../RapidModule.ts';
import type { RapidModuleEventMap } from './EventMap.ts';
import type { RapidModulePayloadOf } from './PayloadOf.ts';

/** The event map `M` was declared with (inferred from its base type argument). */
export type RapidModuleEventsOf<M> = M extends RapidModule<infer E> ? E : never;

/** The payload type of event `K` as declared on module `M`. */
export type RapidModuleEventPayload<
  M extends RapidModule<RapidModuleEventMap>,
  K extends keyof RapidModuleEventsOf<M>,
> = RapidModulePayloadOf<RapidModuleEventsOf<M>[K]>;
