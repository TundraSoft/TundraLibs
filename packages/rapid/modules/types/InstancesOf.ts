/**
 * @fileoverview {@link RapidModuleInstancesOf} — for one namespace, the
 * export names that are concrete zero-arg module classes → their instance
 * types (abstract bases and classes needing constructor args fall out).
 *
 * @module
 */

import type { RapidModule } from '../RapidModule.ts';
import type { RapidModuleEventMap } from './EventMap.ts';

/** Concrete zero-arg module classes of a namespace → their instances. */
export type RapidModuleInstancesOf<NS> = {
  [
    K in keyof NS as NS[K] extends new () => RapidModule<RapidModuleEventMap>
      ? K
      : never
  ]: NS[K] extends new () => infer I ? I : never;
};
