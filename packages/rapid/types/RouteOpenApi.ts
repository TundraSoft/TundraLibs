/**
 * @fileoverview {@link RapidRouteOpenApi} — the OpenAPI-relevant metadata
 * a decorated route carries on its {@link RapidRouteEntry}, attached at
 * mount and read (once, cached) by the OpenAPI assembler. Never touched on
 * the request path.
 *
 * @module
 */

import type { RapidBinder } from './Binder.ts';

/** Doc metadata for one route. */
export type RapidRouteOpenApi = {
  /** Human summary from `@GET(..., { description })`. */
  description?: string;
  /** The route's binders — param/query/header/payload sources. */
  binds?: readonly RapidBinder[];
  /** The declared response schema (from `@GET(..., { response })`). */
  response?: { toOpenAPI?: () => unknown };
};
