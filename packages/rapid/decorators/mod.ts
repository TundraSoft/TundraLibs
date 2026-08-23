/**
 * @fileoverview Barrel for the decorator tier: metadata-only TC39
 * method decorators (`@GET`/`@POST`/…/`@SOCKET`/`@JOB`), the binder
 * factories that type their `bind` tuples, and the side-table readers
 * the module tier mounts from. Modules stay framework-free — nothing
 * here wraps a method or touches a class.
 *
 * @module
 */

export {
  auth,
  config,
  connection,
  cookie,
  header,
  paging,
  param,
  payload,
  query,
  session,
} from './binders.ts';
export {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
  type RouteDecoratorOptions,
} from './http.ts';
export { JOB, type JobDecoratorOptions } from './job.ts';
export {
  Module,
  type ModuleDecoratorOptions,
  type ModuleMountOptions,
} from './module.ts';
export { On } from './on.ts';
export { Use } from './use.ts';
export {
  decoratedNamesOf,
  decorationsOf,
  moduleMetaOf,
  recordDecoration,
  recordModule,
} from './registry.ts';
export { SOCKET, type SocketDecoratorOptions } from './socket.ts';
