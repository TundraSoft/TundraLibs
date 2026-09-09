/**
 * @fileoverview {@link RapidModuleSources} — what `initModules` loads:
 * STATIC namespaces (`await import('./modules/mod.ts')` — bundler- and
 * Workers-safe, typed) and/or ready instances under caller-chosen keys.
 * No path strings: directory walking is a build-time (CLI) concern.
 *
 * @module
 */

import type { RapidModule } from '../../modules/RapidModule.ts';
import type { RapidModuleEventMap } from './EventMap.ts';

/** The module sources for one `initModules` call. */
export type RapidModuleSources<
  M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>>,
> = {
  /** Namespace objects; every export that is a concrete module class is constructed. */
  modules: M;
  /** Pre-built instances (classes that need constructor args), keyed by you. */
  instances?: I;
};
