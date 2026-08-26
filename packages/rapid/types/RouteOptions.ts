/**
 * @fileoverview {@link RapidRouteOptions} — the optional options object the
 * route-registration surface (`app.route()` and the verb helpers) accepts
 * before the middleware/handler chain.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';
import type { RapidRouteOpenApi } from './RouteOpenApi.ts';
import type { RapidRouteTemplate } from './RouteTemplate.ts';
import type { RapidTemplate } from './Template.ts';

/** Options accepted ahead of the chain by `route()` and the verb helpers. */
export type RapidRouteOptions = {
  /** Radrouter version slot — a dimension separate from `path`. */
  version?: string;
  /** OpenAPI metadata (normally supplied by the decorator mount). */
  openapi?: RapidRouteOpenApi;
  /**
   * HTML template for this route — a bare `RapidTemplate` or the object
   * form with `layout`/`title`/`prefer` (see {@link RapidRouteTemplate}).
   * HTTP routes only (this options object never reaches `socket()`/
   * `job()`; the decorator variants for those transports have no
   * template key).
   */
  template?: RapidTemplate<unknown> | RapidRouteTemplate;
  /**
   * Page layout for this route — sugar for the object form's `layout`;
   * the object form wins when both are given.
   */
  layout?: RapidTemplate<{ body: Html; title?: string }>;
};
