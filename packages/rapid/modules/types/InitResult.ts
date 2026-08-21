/**
 * @fileoverview {@link RapidModuleInitResult} — `initModules` returns the
 * typed instances AND the runtime that owns them (for `invoke`, `emit`,
 * `drain`, `dispose` from outside a module — tests, scripts, the app).
 *
 * @module
 */

import type { ModuleRuntime } from '../ModuleRuntime.ts';
import type { RapidModule } from '../RapidModule.ts';
import type { RapidModuleEventMap } from './EventMap.ts';
import type { RapidModuleInstances } from './Instances.ts';

/** The bootstrap result. */
export type RapidModuleInitResult<
  M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>>,
> = {
  modules: RapidModuleInstances<M, I>;
  runtime: ModuleRuntime;
};
