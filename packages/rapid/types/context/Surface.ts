/**
 * @fileoverview {@link RapidContextSurface} — which face of the app an HTTP
 * request addresses.
 *
 * @module
 */

/**
 * The surface an HTTP request resolved to — decided ONCE per request,
 * before routing, from `server.api` (`hosts` / `prefix`) and `ui.enabled`.
 * `'api'` requests see a smaller route table (no pages, no `server.static`,
 * no UI runtime routes) and never get HTML; `'ui'` requests get today's
 * full behaviour. Sockets and jobs have no surface.
 */
export type RapidContextSurface = 'ui' | 'api';
