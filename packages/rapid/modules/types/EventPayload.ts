/**
 * @fileoverview {@link RapidModuleEventPayload} — a subscriber's way to
 * type its parameter from the PUBLISHER's declaration without a runtime
 * import: `RapidModuleEventPayload<Posts, 'PostCreated'>` (use with
 * `import type { Posts }`, which is erased — no module import cycles).
 *
 * @module
 */

import type { RapidModule } from '../RapidModule.ts';
import type { RapidModulePayloadOf } from './PayloadOf.ts';

/** The payload type of event `K` as declared on module `M`. */
export type RapidModuleEventPayload<
  M extends RapidModule,
  K extends keyof M['events'],
> = RapidModulePayloadOf<M['events'][K]>;
