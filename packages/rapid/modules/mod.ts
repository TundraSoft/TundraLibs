/**
 * @fileoverview The module system (POC, self-contained under `modules/`):
 * `RapidModule` base · `initModules` bootstrap · `ModuleRuntime` ·
 * `@On`/`@Use` · typed event declaration via `payload()`.
 *
 * @module
 */

export { EventContext, InvokeContext } from './contexts.ts';
export { middlewareOf, On, onEventsOf, Use } from './decorators.ts';
export {
  EVENT_NAME_PATTERN,
  NAME_PATTERN,
  NAMESPACE_PATTERN,
  payload,
  RapidEvents,
} from './events.ts';
export { buildModuleContext, initModules } from './initModules.ts';
export { ModuleRuntime } from './ModuleRuntime.ts';
export {
  type ModuleClass,
  type ModuleMethodKeys,
  RapidModule,
  type RapidModuleLifecycle,
} from './RapidModule.ts';
export type * from './types/mod.ts';
