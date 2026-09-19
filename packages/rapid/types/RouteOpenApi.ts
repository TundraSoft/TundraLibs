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
  /**
   * This route answers with a COLLECTION — it declares the body's
   * shape, nothing more. Two things follow, both documentation:
   *
   * - With no {@link response}, the documented body is an array of
   *   object rather than the bare-object default, which would be a
   *   lie for a list route.
   * - The operation documents the `server.paging` request parameters
   *   and the three response headers, so a client can discover how to
   *   ask for a page and where the total comes back.
   *
   * A declared {@link response} is always used VERBATIM — declare the
   * array yourself. Nothing is wrapped for you, so the schema that is
   * documented is exactly the one DEVELOPMENT validates the reply
   * against.
   *
   * INDEPENDENT of the runtime `paging` reply key, which is what
   * actually sets the headers. An envelope route simply leaves this
   * unset, declares its own object schema, and still gets headers from
   * the key.
   */
  paging?: boolean;
};
