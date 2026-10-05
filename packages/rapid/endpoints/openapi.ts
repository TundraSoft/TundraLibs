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
import type { HTTPContext } from '../context/HTTPContext.ts';
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

/** One operation as a per-viewer filter sees it. */
export type OpenApiOperationRef = {
  method: string;
  /** The OpenAPI path (`/posts/{id}`). */
  path: string;
  operationId?: string;
  /** The route's declared `access` string, when it has one. */
  access?: string;
};

/**
 * Per-viewer operation filter: `'access'` keeps an operation when the
 * app's auth binding lets THIS caller run it (public operations always
 * stay); a function decides itself. Applied per request over the cached
 * document, so what a viewer sees is what they may call.
 */
export type OpenApiOperationFilter =
  | 'access'
  | ((
    operation: OpenApiOperationRef,
    ctx: HTTPContext<RapidContextState>,
  ) => boolean | Promise<boolean>);

/** The document-shaping options `openapi()` and `docs()` share. */
export type OpenApiDocumentOptions = {
  /**
   * Cut the document per viewer: `'access'` judges every operation's
   * `x-access` through `app.auth()`'s `authorize` for the requesting
   * caller (RAPID_CONFIG when no binding is bound), or a function of
   * your own. Operations that fail are removed, empty paths with them;
   * the cached document is never modified. Pair with `expose: 'ALL'`
   * to serve a signed-in reference in production.
   * @default none — every viewer sees the whole document
   */
  filter?: OpenApiOperationFilter;
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
    // Document the names this app actually sends, not the defaults.
    pagingHeaders: app.option('server')?.paging ?? {},
    // Where an api surface exists a page is served as JSON there.
    apiSurface: app.apiSurface !== undefined || !app.uiEnabled,
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

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/**
 * The document cut for one viewer: every operation `filter` declines is
 * dropped, a path left with no operations goes with it. A COPY — the
 * cached document is shared by every request. Shared by `openapi()` and
 * `docs()`.
 *
 * @throws {RapidError} RAPID_CONFIG for `'access'` on an app with no
 *   auth binding.
 */
export async function filterOpenApi<S extends RapidContextState>(
  doc: Record<string, unknown>,
  ctx: HTTPContext<S>,
  filter: OpenApiOperationFilter,
): Promise<Record<string, unknown>> {
  let keep: (
    op: OpenApiOperationRef,
  ) => boolean | Promise<boolean>;
  if (filter === 'access') {
    const binding = ctx.app.authBinding;
    if (binding === undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          "openapi/docs filter: 'access' needs an auth binding — call app.auth({ authenticate, authorize })",
      });
    }
    keep = (op) =>
      op.access === undefined ? true : binding.authorize(
        ctx as unknown as HTTPContext<RapidContextState>,
        op.access,
      );
  } else {
    keep = (op) => filter(op, ctx as unknown as HTTPContext<RapidContextState>);
  }
  const paths: Record<string, Record<string, unknown>> = {};
  for (
    const [path, item] of Object.entries(
      doc.paths as Record<string, Record<string, unknown>>,
    )
  ) {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (!HTTP_METHODS.has(key)) {
        kept[key] = value; // parameters, summary — path-level fields
        continue;
      }
      const op = value as Record<string, unknown>;
      const ref: OpenApiOperationRef = {
        method: key.toUpperCase(),
        path,
        ...(typeof op.operationId === 'string'
          ? { operationId: op.operationId }
          : {}),
        ...(typeof op['x-access'] === 'string'
          ? { access: op['x-access'] }
          : {}),
      };
      if (await keep(ref)) kept[key] = value;
    }
    if (Object.keys(kept).some((k) => HTTP_METHODS.has(k))) paths[path] = kept;
  }
  return { ...doc, paths };
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
    const doc = assembleOpenApi(ctx.app, options, cache, version);
    if (options.filter === undefined) return { content: doc };
    return filterOpenApi(doc, ctx, options.filter).then((content) => ({
      content,
    }));
  };
}
