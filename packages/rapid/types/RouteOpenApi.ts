/**
 * @fileoverview {@link RapidRouteOpenApi} — the OpenAPI metadata a route
 * carries: what the decorators declared (summary, description, tags,
 * operation id, security, binds, response) plus the owning module's doc
 * identity, read by `buildOpenApi`.
 *
 * @module
 */

import type { RapidBinder } from './Binder.ts';

/** OpenAPI metadata attached to a registered route. */
export type RapidRouteOpenApi = {
  /** One-line operation summary (`@GET(..., { summary })`). */
  summary?: string;
  /** Longer operation description (`@GET(..., { description })`). */
  description?: string;
  /**
   * Grouping tags. For a decorated route: the owning module's tags (its
   * `name` by default) merged with the route's own, deduplicated.
   */
  tags?: readonly string[];
  /**
   * Unique operation id. Decorated routes default to `<ModuleName>_<method>`
   * (the key an SDK generator names its methods by); overridable per route.
   */
  operationId?: string;
  /**
   * Security-scheme NAMES the operation requires — `['bearerAuth']` emits
   * the requirement and the padlock. An EMPTY array marks a deliberately
   * public route (overriding a module default). `bearerAuth` is declared for
   * you; any other scheme is declared via `openapi({ securitySchemes })`.
   */
  security?: readonly string[];
  /**
   * The owning module's doc identity — aggregated by the assembler into the
   * document's top-level `tags` (with the module `description`) and, when a
   * `namespace` is present, into `x-tagGroups` (namespace → module tags).
   */
  module?: { name?: string; namespace?: string; description?: string };
  /** The route's binders — param/query/header/payload sources. */
  binds?: readonly RapidBinder[];
  /**
   * The declared response schema (from `@GET(..., { response })`) — either
   * emitter is honored (`toOpenAPI` preferred, then `toJSONSchema`), matching
   * the request-body path. When it can also `parse` (a full guardian
   * schema), DEVELOPMENT mode enforces it against the actual reply — see
   * the decorator option's doc for the exact scope.
   */
  response?: {
    parse?: (value: unknown) => unknown;
    toOpenAPI?: () => unknown;
    toJSONSchema?: () => unknown;
  };
};
