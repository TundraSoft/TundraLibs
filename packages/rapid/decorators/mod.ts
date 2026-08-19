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
  connection,
  header,
  paging,
  param,
  payload,
  query,
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
export { Module, type ModuleDecoratorOptions } from './module.ts';
export {
  decorationsOf,
  moduleMetaOf,
  recordDecoration,
  recordModule,
} from './registry.ts';
export { SOCKET, type SocketDecoratorOptions } from './socket.ts';
