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
   * Serve this route on the `api` surface ONLY — it is absent from the
   * `ui` surface's route table (a 404 there, byte-identical to a missing
   * URL). Without it every route answers on BOTH surfaces, and
   * `onlyApi()`-scoped middleware (rate limiting, CORS, an authenticate
   * step) is skipped on the un-prefixed ui-surface URL. Requires an api
   * surface (`server.api`); registering an api-only route on an app that
   * has none is a `RAPID_CONFIG` error, since it could never be reached.
   */
  apiOnly?: boolean;
  /**
   * Serve this route on the `ui` surface ONLY — absent from the `api`
   * surface's route table (a 404 there, byte-identical to a missing
   * URL). The api surface otherwise serves every templated route as
   * JSON, pages included; mark the ones whose content is not an API
   * contract (a sign-in form, a settings page). On a `ui.enabled: false`
   * replica every request is the api surface, so the route is simply
   * absent there. Excludes `apiOnly` (`RAPID_CONFIG`).
   */
  uiOnly?: boolean;
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
   * the object form wins when both are given. `false` opts this route
   * out of the module tier entirely (straight into the core).
   */
  layout?: RapidTemplate<{ body: Html; title?: string }> | false;
};
