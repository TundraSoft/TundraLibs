/**
 * @fileoverview The module system (POC, self-contained under `modules/`):
 * `RapidModule` base · `initModules` bootstrap · `ModuleRuntime` ·
 * `@On`/`@Use` · `event()` event declaration · `reply()` envelopes.
 *
 * @module
 */

export { On, Use } from '../decorators/mod.ts';
export { EventContext } from './EventContext.ts';
export { event } from './events.ts';
export { buildModuleContext, initModules } from './initModules.ts';
export { InvokeContext } from './InvokeContext.ts';
export { ModuleRuntime } from './ModuleRuntime.ts';
export { RapidModule, type RapidModuleLifecycle } from './RapidModule.ts';
export { Reply, reply } from './reply.ts';
export type * from '../types/mod.ts';
