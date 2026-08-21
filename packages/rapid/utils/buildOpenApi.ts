/**
 * @fileoverview `buildOpenApi` — assemble an OpenAPI 3.0.3 document from
 * the app's registered routes and their attached metadata. Pure and
 * cacheable (the `openapi()` endpoint caches per version); never runs on
 * the request path. Decorated routes contribute descriptions and response
 * schemas (guardian `toOpenAPI()`); function routes contribute a bare
 * path. Every route references one shared error-envelope component.
 *
 * @module
 */

import { RAPID_ERROR_CODES } from '../errors/mod.ts';
import type { RapidRouteEntry } from '../types/mod.ts';

/** Document metadata + servers. */
export type OpenApiInfo = {
  title?: string;
  version?: string;
  description?: string;
};

/** `{ url, description? }` server entries. */
export type OpenApiServer = { url: string; description?: string };

const toOpenApiPath = (path: string): { path: string; params: string[] } => {
  const params: string[] = [];
  const converted = path.replace(/:([^:/]+):/g, (_, name: string) => {
    params.push(name);
    return `{${name}}`;
  });
  return { path: converted, params };
};

const errorRef = { $ref: '#/components/schemas/RapidError' };
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});

/**
 * Build the OpenAPI document. When `version` is given, only routes of that
 * version (or unversioned) are included — header-versioned routes sharing
 * a path can't coexist in one document.
 */
export function buildOpenApi(
  routes: readonly RapidRouteEntry[],
  options: {
    info?: OpenApiInfo;
    servers?: readonly OpenApiServer[];
    version?: string;
  } = {},
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    if (
      options.version !== undefined && route.version !== undefined &&
      route.version !== options.version
    ) {
      continue;
    }
    const { path, params } = toOpenApiPath(route.path);
    const meta = route.openapi;

    const parameters = params.map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    for (const bind of meta?.binds ?? []) {
      if ((bind.source === 'query' || bind.source === 'header') && bind.name) {
        parameters.push({
          name: bind.name,
          in: bind.source === 'header' ? 'header' : 'query',
          required: false,
          schema: { type: 'string' },
        });
      }
    }

    const hasBody = (meta?.binds ?? []).some((b) => b.source === 'payload');
    const responseSchema = meta?.response?.toOpenAPI?.() ?? { type: 'object' };

    const operation: Record<string, unknown> = {
      ...(meta?.description !== undefined ? { summary: meta.description } : {}),
      ...(route.version !== undefined ? { tags: [route.version] } : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(hasBody
        ? {
          requestBody: {
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        }
        : {}),
      responses: {
        '200': {
          description: 'OK',
          content: { 'application/json': { schema: responseSchema } },
        },
        '400': errorResponse('Bad request'),
        '401': errorResponse('Unauthenticated'),
        '403': errorResponse('Forbidden'),
        '404': errorResponse('Not found'),
        '500': errorResponse('Internal server error'),
      },
    };

    (paths[path] ??= {})[route.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: options.info?.title ?? 'rapid API',
      version: options.info?.version ?? '1.0.0',
      ...(options.info?.description !== undefined
        ? { description: options.info.description }
        : {}),
    },
    ...(options.servers !== undefined && options.servers.length > 0
      ? { servers: options.servers }
      : {}),
    paths,
    components: {
      schemas: {
        RapidError: {
          type: 'object',
          properties: {
            code: { type: 'string', enum: Object.keys(RAPID_ERROR_CODES) },
            message: { type: 'string' },
            requestId: { type: 'string' },
          },
          required: ['code', 'message'],
        },
      },
    },
  };
}
