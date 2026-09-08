/**
 * @fileoverview `openapi()` — a mountable endpoint serving the assembled
 * OpenAPI 3.0.3 document: `app.get('/openapi.json', openapi())`. The
 * document is built once per version and cached. `?version=v2` serves that
 * version's routes (header-versioned routes sharing a path can't coexist
 * in one document). `expose` gates which app modes serve it — DEVELOPMENT
 * only by default, so the full route inventory isn't exposed anonymously in
 * production. JSON only — point your own Swagger/Redoc route at this URL.
 *
 * @module
 */
import { RapidError } from '../errors/mod.ts';
import {
  buildOpenApi,
  type OpenApiInfo,
  type OpenApiSecuritySchemes,
  type OpenApiServer,
} from '../utils/mod.ts';
import type { RapidHTTPHandler } from '../types/mod.ts';

/** Options for {@link openapi}. */
export type OpenApiOptions = {
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
   */
  securitySchemes?: OpenApiSecuritySchemes;
  /**
   * Which app modes serve the spec. Secure-by-default: DEVELOPMENT only, so
   * mounting it doesn't leak the full route inventory to anonymous clients in
   * production — set `'ALL'` to serve everywhere (e.g. behind auth).
   * @default 'DEVELOPMENT'
   */
  expose?: 'DEVELOPMENT' | 'PRODUCTION' | 'ALL';
};

/** An endpoint handler serving the assembled OpenAPI document. */
export function openapi(options: OpenApiOptions = {}): RapidHTTPHandler {
  const expose = options.expose ?? 'DEVELOPMENT';
  const cache = new Map<string, Record<string, unknown>>();
  return (ctx) => {
    if (expose !== 'ALL' && expose !== ctx.app.mode) {
      // Indistinguishable from an unrouted path — same envelope, same
      // requestId, same disclosure.
      throw new RapidError('RAPID_NOT_FOUND');
    }
    const version = new URL(ctx.request.url).searchParams.get('version') ?? '';
    const cached = cache.get(version);
    if (cached !== undefined) return { content: cached };
    const doc = buildOpenApi(ctx.app.routes, {
      info: { title: ctx.app.option('name'), ...options.info },
      uiPrefer: ctx.app.uiPrefer,
      // Pages are not reachable where an api surface exists.
      omitPages: ctx.app.apiSurface !== undefined || !ctx.app.uiEnabled,
      ...(options.servers !== undefined ? { servers: options.servers } : {}),
      ...(options.securitySchemes !== undefined
        ? { securitySchemes: options.securitySchemes }
        : {}),
      ...(version !== '' ? { version } : {}),
    });
    // Cache ONLY real versions. `?version=` is client-controlled and
    // unbounded, so caching every distinct value (each a full doc) is a
    // memory-exhaustion vector — an unknown version is built fresh, uncached.
    const known = version === '' ||
      ctx.app.routes.some((r) => r.version === version);
    if (known) cache.set(version, doc);
    return { content: doc };
  };
}
