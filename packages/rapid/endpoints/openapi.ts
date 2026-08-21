/**
 * @fileoverview `openapi()` — a mountable endpoint serving the assembled
 * OpenAPI 3.0.3 document: `app.get('/openapi.json', openapi())`. The
 * document is built once per version and cached. `?version=v2` serves that
 * version's routes (header-versioned routes sharing a path can't coexist
 * in one document). `expose` gates which app modes serve it. JSON only —
 * point your own Swagger/Redoc route at this URL.
 *
 * @module
 */
import {
  buildOpenApi,
  type OpenApiInfo,
  type OpenApiServer,
} from '../utils/mod.ts';
import type { RapidHTTPHandler } from '../types/mod.ts';

/** Options for {@link openapi}. */
export type OpenApiOptions = {
  info?: OpenApiInfo;
  servers?: readonly OpenApiServer[];
  /** Which app modes serve the spec. @default 'ALL' */
  expose?: 'DEVELOPMENT' | 'PRODUCTION' | 'ALL';
};

/** An endpoint handler serving the assembled OpenAPI document. */
export function openapi(options: OpenApiOptions = {}): RapidHTTPHandler {
  const expose = options.expose ?? 'ALL';
  const cache = new Map<string, Record<string, unknown>>();
  return (ctx) => {
    if (expose !== 'ALL' && expose !== ctx.app.mode) {
      return {
        status: 404,
        content: { code: 'RAPID_NOT_FOUND', message: 'Not found' },
      };
    }
    const version = new URL(ctx.request.url).searchParams.get('version') ?? '';
    let doc = cache.get(version);
    if (doc === undefined) {
      doc = buildOpenApi(ctx.app.routes, {
        info: { title: ctx.app.option('name'), ...options.info },
        ...(options.servers !== undefined ? { servers: options.servers } : {}),
        ...(version !== '' ? { version } : {}),
      });
      cache.set(version, doc);
    }
    return { content: doc };
  };
}
