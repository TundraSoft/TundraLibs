/**
 * @fileoverview `openapi()` — a mountable endpoint serving the assembled
 * OpenAPI 3.0.3 document: `app.get('/openapi.json', openapi())`. The
 * document is built once per version and cached. `?version=v2` serves that
 * version's routes (header-versioned routes sharing a path can't coexist
 * in one document). `expose` gates which app modes serve it — DEVELOPMENT
 * only by default, so the full route inventory isn't exposed anonymously in
 * production. JSON only — `docs()` is the page over it.
 *
 * @module
 */
import type { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import {
  assertSecuritySchemes,
  buildOpenApi,
  type OpenApiInfo,
  type OpenApiSecuritySchemes,
  type OpenApiServer,
} from '../utils/mod.ts';
import type {
  RapidContextState,
  RapidHTTPHandler,
  RapidRouteEntry,
} from '../types/mod.ts';

/** The document-shaping options `openapi()` and `docs()` share. */
export type OpenApiDocumentOptions = {
  /**
   * The document's `info` block.
   * @default title = the app `name`, version = '1.0.0'
   */
  info?: OpenApiInfo;
  /**
   * The document's `servers` list.
   * @default omitted
   */
  servers?: readonly OpenApiServer[];
  /**
   * Security schemes routes may reference by name in `security`. `bearerAuth`
   * (HTTP bearer) is always declared; declare anything else here, e.g.
   * `{ apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } }`.
   * Validated when the endpoint is created (RAPID_CONFIG).
   */
  securitySchemes?: OpenApiSecuritySchemes;
};

/** Options for {@link openapi}. */
export type OpenApiOptions = OpenApiDocumentOptions & {
  /**
   * Which app modes serve the spec. Secure-by-default: DEVELOPMENT only, so
   * mounting it doesn't leak the full route inventory to anonymous clients in
   * production — set `'ALL'` to serve everywhere (e.g. behind auth).
   * @default 'DEVELOPMENT'
   */
  expose?: 'DEVELOPMENT' | 'PRODUCTION' | 'ALL';
};

/**
 * Build (or fetch from `cache`) the document for `version` (`''` = all
 * routes). Cache ONLY real versions: `?version=` is client-controlled and
 * unbounded, so caching every distinct value (each a full doc) would be a
 * memory-exhaustion vector — an unknown version is built fresh, uncached.
 * Shared by `openapi()` and `docs()`.
 */
export function assembleOpenApi<S extends RapidContextState>(
  app: Application<S>,
  options: OpenApiDocumentOptions,
  cache: Map<string, Record<string, unknown>>,
  version: string,
): Record<string, unknown> {
  const cached = cache.get(version);
  if (cached !== undefined) return cached;
  // The assembler reads only state-free route fields.
  const routes = app.routes as unknown as readonly RapidRouteEntry[];
  const doc = buildOpenApi(routes, {
    info: { title: app.option('name'), ...options.info },
    uiPrefer: app.uiPrefer,
    // Pages are not reachable where an api surface exists.
    omitPages: app.apiSurface !== undefined || !app.uiEnabled,
    ...(options.servers !== undefined ? { servers: options.servers } : {}),
    ...(options.securitySchemes !== undefined
      ? { securitySchemes: options.securitySchemes }
      : {}),
    ...(version !== '' ? { version } : {}),
  });
  const known = version === '' || routes.some((r) => r.version === version);
  if (known) cache.set(version, doc);
  return doc;
}

/**
 * An endpoint handler serving the assembled OpenAPI document.
 *
 * @throws {RapidError} RAPID_CONFIG when a security scheme is malformed.
 */
export function openapi(options: OpenApiOptions = {}): RapidHTTPHandler {
  if (options.securitySchemes !== undefined) {
    assertSecuritySchemes(options.securitySchemes, 'openapi()');
  }
  const expose = options.expose ?? 'DEVELOPMENT';
  const cache = new Map<string, Record<string, unknown>>();
  return (ctx) => {
    if (expose !== 'ALL' && expose !== ctx.app.mode) {
      // Indistinguishable from an unrouted path — same envelope, same
      // requestId, same disclosure.
      throw new RapidError('RAPID_NOT_FOUND');
    }
    const version = new URL(ctx.request.url).searchParams.get('version') ?? '';
    return { content: assembleOpenApi(ctx.app, options, cache, version) };
  };
}
