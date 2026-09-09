/**
 * @fileoverview {@link RapidModuleEventPayload} — a subscriber's way to
 * type its parameter from the PUBLISHER's declaration with a TYPE-ONLY
 * import (erased — no runtime module cycles):
 * `RapidModuleEventPayload<Posts, 'PostCreated'>`.
 *
 * @module
 */

import type { RapidModule } from '../../modules/RapidModule.ts';
import type { RapidModuleEventMap } from './EventMap.ts';
import type { RapidModuleEventsOf } from './EventsOf.ts';
import type { RapidModulePayloadOf } from './PayloadOf.ts';

/** The payload type of event `K` as declared on module `M`. */
export type RapidModuleEventPayload<
  M extends RapidModule<RapidModuleEventMap>,
  K extends keyof RapidModuleEventsOf<M>,
> = RapidModulePayloadOf<RapidModuleEventsOf<M>[K]>;
