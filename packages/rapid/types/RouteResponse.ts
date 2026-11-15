/**
 * @fileoverview {@link RapidRouteResponse} — what a route declares it
 * answers with (`@GET(..., { response })` / the `response` route option),
 * for every surface or per surface.
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
 * A reply that is not JSON, by name: `'none'` (no body, a 204), `'text'`
 * (a string), `'bytes'` (a `Uint8Array`), `'stream'` (a stream body) or
 * `'redirect'` (the `redirect` reply key).
 */
export type RapidRouteResponseKind =
  | 'none'
  | 'text'
  | 'bytes'
  | 'stream'
  | 'redirect';

/**
 * What a route answers with: a schema for a JSON reply, or a
 * {@link RapidRouteResponseKind} for one that is not JSON. One value
 * covers every surface. `{ api, ui }` declares one per surface, for a
 * route that answers its API with a resource and its page with the
 * template's data: the OpenAPI document shows the `api` entry,
 * DEVELOPMENT checks a reply against the entry of the surface it answers
 * on, and a surface with none is neither documented nor checked.
 */
export type RapidRouteResponse =
  | ResponseSchema
  | RapidRouteResponseKind
  | {
    api?: ResponseSchema | RapidRouteResponseKind;
    ui?: ResponseSchema | RapidRouteResponseKind;
  };
