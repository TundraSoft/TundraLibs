/**
 * @fileoverview `buildOpenApi` — assemble an OpenAPI 3.0.3 document from
 * the app's registered routes and their attached metadata. Pure and
 * cacheable (the `openapi()` endpoint caches per version); never runs on
 * the request path. Decorated routes contribute summary/description,
 * tags (the owning module's name by default), an operation id, security
 * requirements, the request-body schema (`payload(Schema)`) and the
 * response schema (`response: Schema`); function routes contribute a bare
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

/**
 * Security schemes to declare under `components.securitySchemes`, keyed by
 * the name routes reference in `security`. `bearerAuth` (HTTP bearer) is
 * always declared; entries here are merged over it.
 */
export type OpenApiSecuritySchemes = Record<string, Record<string, unknown>>;

/** Declared for every document that has a secured route — rapid's `authenticate` default. */
const BEARER_AUTH = { type: 'http', scheme: 'bearer' } as const;

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
 * a path can't coexist in one document. Every version any route declares is
 * listed at the root as `x-versions` (and on its operations as `x-version`),
 * so a reader of one version's document can see the others exist.
 */
export function buildOpenApi(
  routes: readonly RapidRouteEntry[],
  options: {
    info?: OpenApiInfo;
    servers?: readonly OpenApiServer[];
    version?: string;
    securitySchemes?: OpenApiSecuritySchemes;
  } = {},
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  // Top-level aggregates, in first-seen route order.
  const tagDocs = new Map<string, string | undefined>(); // module tag → description
  const groups = new Map<string, Set<string>>(); // namespace → module tags
  const versions = new Set<string>();
  let secured = false;

  for (const route of routes) {
    if (route.version !== undefined) versions.add(route.version);
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

    // The body: documented by a schema OBJECT bound via `payload(Schema)`;
    // a bare validator function still marks that a body exists.
    const body = (meta?.binds ?? []).find((b) => b.source === 'payload');
    const bodySchema = body?.schema?.toOpenAPI?.() ??
      body?.schema?.toJSONSchema?.() ?? { type: 'object' };
    const responseSchema = meta?.response?.toOpenAPI?.() ?? { type: 'object' };

    if (meta?.module?.name !== undefined) {
      const { name, namespace, description } = meta.module;
      if (!tagDocs.has(name) || description !== undefined) {
        tagDocs.set(name, description ?? tagDocs.get(name));
      }
      if (namespace !== undefined) {
        (groups.get(namespace) ?? groups.set(namespace, new Set()).get(
          namespace,
        )!).add(name);
      }
    }
    if (meta?.security !== undefined && meta.security.length > 0) {
      secured = true;
    }

    const operation: Record<string, unknown> = {
      ...(meta?.summary !== undefined ? { summary: meta.summary } : {}),
      ...(meta?.description !== undefined
        ? { description: meta.description }
        : {}),
      ...(meta?.operationId !== undefined
        ? { operationId: meta.operationId }
        : {}),
      ...(meta?.tags !== undefined && meta.tags.length > 0
        ? { tags: [...meta.tags] }
        : {}),
      ...(route.version !== undefined ? { 'x-version': route.version } : {}),
      // `[]` is meaningful: it overrides any document-level requirement and
      // marks the operation public, so it is emitted as-is.
      ...(meta?.security !== undefined
        ? { security: meta.security.map((name) => ({ [name]: [] })) }
        : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(body !== undefined
        ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: bodySchema } },
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

  // Redoc/Scalar hide any tag that is not in SOME group once `x-tagGroups`
  // exists, so module tags without a namespace get a trailing catch-all.
  const tagGroups = [...groups].map(([name, tags]) => ({
    name,
    tags: [...tags],
  }));
  if (tagGroups.length > 0) {
    const grouped = new Set([...groups.values()].flatMap((s) => [...s]));
    const ungrouped = [...tagDocs.keys()].filter((t) => !grouped.has(t));
    if (ungrouped.length > 0) {
      tagGroups.push({ name: 'Other', tags: ungrouped });
    }
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
    ...(tagDocs.size > 0
      ? {
        tags: [...tagDocs].map(([name, description]) => ({
          name,
          ...(description !== undefined ? { description } : {}),
        })),
      }
      : {}),
    ...(tagGroups.length > 0 ? { 'x-tagGroups': tagGroups } : {}),
    ...(versions.size > 0 ? { 'x-versions': [...versions].sort() } : {}),
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
      ...(secured || options.securitySchemes !== undefined
        ? {
          securitySchemes: {
            bearerAuth: BEARER_AUTH,
            ...options.securitySchemes,
          },
        }
        : {}),
    },
  };
}
