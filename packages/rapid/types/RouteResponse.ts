/**
 * @fileoverview {@link RapidRouteResponse} — the response schema a route
 * declares (`@GET(..., { response })` / `openapi.response`), for every
 * surface or per surface.
 *
 * @module
 */

/** A response schema: an OpenAPI / JSON-Schema emitter, `parse` optional. */
type ResponseSchema = {
  parse?: (value: unknown) => unknown;
  toOpenAPI?: () => unknown;
  toJSONSchema?: () => unknown;
};

/**
 * A route's response schema. A schema covers every surface. `{ api, ui }`
 * declares one per surface, for a route that answers its API with a
 * resource and its page with the template's data: the OpenAPI document
 * shows the `api` schema, DEVELOPMENT checks a reply against the schema
 * of the surface it answers on, and a surface with none is neither
 * documented nor checked.
 */
export type RapidRouteResponse =
  | ResponseSchema
  | { api?: ResponseSchema; ui?: ResponseSchema };
