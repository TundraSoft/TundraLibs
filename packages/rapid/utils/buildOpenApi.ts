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

import { RAPID_ERROR_CODES, RapidError } from '../errors/mod.ts';
import type { RapidRouteEntry } from '../types/mod.ts';

/** Document metadata + servers. */
export type OpenApiInfo = {
  title?: string;
  version?: string;
  description?: string;
};

/** `{ url, description? }` server entries. */
export type OpenApiServer = { url: string; description?: string };

/** One OAuth 2.0 flow (OpenAPI 3.0 `OAuth Flow Object`). */
export type OpenApiOAuthFlow = {
  /** Required by the `implicit` and `authorizationCode` flows. */
  authorizationUrl?: string;
  /** Required by the `password`, `clientCredentials` and `authorizationCode` flows. */
  tokenUrl?: string;
  refreshUrl?: string;
  /** Scope name → human description; `{}` when the API defines none. */
  scopes: Readonly<Record<string, string>>;
};

/** The flows an `oauth2` scheme offers — at least one. */
export type OpenApiOAuthFlows = {
  implicit?: OpenApiOAuthFlow;
  password?: OpenApiOAuthFlow;
  clientCredentials?: OpenApiOAuthFlow;
  authorizationCode?: OpenApiOAuthFlow;
};

/**
 * One security scheme (OpenAPI 3.0 `Security Scheme Object`), exactly the
 * four kinds the spec defines. `http` covers `Authorization: Bearer …`
 * (`scheme: 'bearer'`, optionally `bearerFormat: 'JWT'`) and HTTP basic;
 * `apiKey` names the header, query parameter or cookie that carries the
 * key; `oauth2` / `openIdConnect` point at the provider.
 */
export type OpenApiSecurityScheme =
  | {
    type: 'http';
    /** An IANA HTTP authentication scheme — `'bearer'`, `'basic'`, … */
    // deno-lint-ignore ban-types
    scheme: 'bearer' | 'basic' | (string & {});
    /** A hint for bearer tokens, e.g. `'JWT'`. */
    bearerFormat?: string;
    description?: string;
  }
  | {
    type: 'apiKey';
    in: 'header' | 'query' | 'cookie';
    /** The header / query parameter / cookie name. */
    name: string;
    description?: string;
  }
  | { type: 'oauth2'; flows: OpenApiOAuthFlows; description?: string }
  | {
    type: 'openIdConnect';
    /** The discovery document URL (`…/.well-known/openid-configuration`). */
    openIdConnectUrl: string;
    description?: string;
  };

/**
 * Security schemes to declare under `components.securitySchemes`, keyed by
 * the name routes reference in `security` (`[A-Za-z0-9._-]+`). `bearerAuth`
 * (HTTP bearer) is always declared; entries here are merged over it.
 */
export type OpenApiSecuritySchemes = Readonly<
  Record<string, OpenApiSecurityScheme>
>;

const SCHEME_KEY = /^[A-Za-z0-9._-]+$/;
const SCHEME_TYPES = ['http', 'apiKey', 'oauth2', 'openIdConnect'] as const;
const FLOW_URLS: Record<keyof OpenApiOAuthFlows, (keyof OpenApiOAuthFlow)[]> = {
  implicit: ['authorizationUrl'],
  password: ['tokenUrl'],
  clientCredentials: ['tokenUrl'],
  authorizationCode: ['authorizationUrl', 'tokenUrl'],
};

const isUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate `securitySchemes` beyond what the type proves — a JS caller or a
 * YAML-loaded object gets the same checks: key grammar, a known `type`,
 * the fields each type requires, at least one OAuth flow with its required
 * URLs parseable, a parseable `openIdConnectUrl`.
 *
 * @param where - the caller named in the message (`openapi()`, `docs()`).
 * @throws {RapidError} RAPID_CONFIG naming the offending scheme.
 */
export function assertSecuritySchemes(
  schemes: OpenApiSecuritySchemes,
  where = 'openapi()',
): void {
  const fail = (name: string, message: string): never => {
    throw new RapidError('RAPID_CONFIG', {
      message: `${where}: securitySchemes.${name} ${message}`,
      details: { scheme: name },
    });
  };
  for (const [name, scheme] of Object.entries(schemes)) {
    if (!SCHEME_KEY.test(name)) {
      fail(name, 'must be named [A-Za-z0-9._-]+ — it is referenced by name');
    }
    if (scheme === null || typeof scheme !== 'object') {
      fail(name, 'must be an object');
    }
    const s = scheme as Record<string, unknown>;
    if (!SCHEME_TYPES.includes(s.type as typeof SCHEME_TYPES[number])) {
      fail(name, `type must be one of ${SCHEME_TYPES.join(' | ')}`);
    }
    switch (s.type) {
      case 'http':
        if (typeof s.scheme !== 'string' || s.scheme === '') {
          fail(name, "needs a non-empty scheme ('bearer', 'basic', …)");
        }
        break;
      case 'apiKey':
        if (!['header', 'query', 'cookie'].includes(s.in as string)) {
          fail(name, "needs in: 'header' | 'query' | 'cookie'");
        }
        if (typeof s.name !== 'string' || s.name === '') {
          fail(name, 'needs the header / parameter / cookie name');
        }
        break;
      case 'oauth2': {
        const flows = s.flows;
        if (flows === null || typeof flows !== 'object') {
          fail(name, 'needs flows');
        }
        const entries = Object.entries(flows as Record<string, unknown>);
        if (entries.length === 0) fail(name, 'needs at least one flow');
        for (const [flow, config] of entries) {
          const required = FLOW_URLS[flow as keyof OpenApiOAuthFlows];
          if (required === undefined) {
            fail(name, `has an unknown flow '${flow}'`);
          }
          const c = config as Record<string, unknown>;
          for (const key of required) {
            if (!isUrl(c[key])) {
              fail(name, `flow '${flow}' needs a valid ${key}`);
            }
          }
          if (c.scopes === null || typeof c.scopes !== 'object') {
            fail(name, `flow '${flow}' needs scopes ({} when none)`);
          }
        }
        break;
      }
      case 'openIdConnect':
        if (!isUrl(s.openIdConnectUrl)) {
          fail(name, 'needs a valid openIdConnectUrl');
        }
        break;
    }
  }
}

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

/** Order versions so `v2` precedes `v10` (lexicographic would invert them). */
const byNaturalVersion = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

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
    /**
     * The app-wide `ui.prefer` — decides which templated routes are
     * PAGES (`text/html` only, never JSON). @default 'json'
     */
    uiPrefer?: 'json' | 'html';
    /**
     * Leave pages out of the document — the app has an api surface
     * (`server.api` / `ui.enabled: false`) on which they do not exist.
     */
    omitPages?: boolean;
  } = {},
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  // Top-level aggregates, in first-seen route order.
  const allTags = new Set<string>(); // every operation tag → the tags[] catalog
  const tagDocs = new Map<string, string>(); // a module's name tag → its description
  const groups = new Map<string, Set<string>>(); // namespace → its operation tags
  const versions = new Set<string>();
  let secured = false;

  for (const route of routes) {
    // UI infrastructure (the client runtime scripts) is not API.
    if (route.uiOnly === true) continue;
    const page = route.template !== undefined &&
      (route.template.prefer ?? options.uiPrefer ?? 'json') === 'html';
    if (page && options.omitPages === true) continue;
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

    // The body is documented by a schema OBJECT bound via `payload(Schema)`;
    // a bare validator function still marks that a body exists. Both body and
    // response accept an OpenAPI OR a JSON-Schema emitter (the same fallback).
    const body = (meta?.binds ?? []).find((b) => b.source === 'payload');
    const responseSchema = meta?.response?.toOpenAPI?.() ??
      meta?.response?.toJSONSchema?.() ?? { type: 'object' };

    // Aggregate the ACTUAL operation tags (module default + route extras), not
    // just the module name — so every tag reaches the top-level catalog and a
    // namespace group. Redoc/Scalar HIDE any tag absent from both once
    // `x-tagGroups` exists, which is why keying by name alone dropped custom
    // `@Module({tags})` / `@GET({tags})`.
    const opTags = meta?.tags ?? [];
    for (const t of opTags) allTags.add(t);
    if (meta?.module !== undefined) {
      const { name, namespace, description } = meta.module;
      // A module's description annotates its NAME tag, when that tag is in use
      // (a module that opted out of the name tag via `tags: []` has none).
      if (
        description !== undefined && name !== undefined && opTags.includes(name)
      ) {
        tagDocs.set(name, description);
      }
      if (namespace !== undefined) {
        let set = groups.get(namespace);
        if (set === undefined) groups.set(namespace, set = new Set());
        for (const t of opTags) set.add(t);
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
            content: {
              'application/json': {
                schema: body.schema?.toOpenAPI?.() ??
                  body.schema?.toJSONSchema?.() ?? { type: 'object' },
              },
            },
          },
        }
        : {}),
      responses: {
        '200': {
          description: 'OK',
          // An API-first templated route serves BOTH representations —
          // JSON by default, a fragment on a swap; a PAGE (`prefer:
          // 'html'`) is a page or a fragment, never JSON (see ./ui).
          content: page
            ? { 'text/html': { schema: { type: 'string' } } }
            : route.template !== undefined
            ? {
              'application/json': { schema: responseSchema },
              'text/html': { schema: { type: 'string' } },
            }
            : { 'application/json': { schema: responseSchema } },
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
    const ungrouped = [...allTags].filter((t) => !grouped.has(t));
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
    ...(allTags.size > 0
      ? {
        tags: [...allTags].map((name) => ({
          name,
          ...(tagDocs.has(name) ? { description: tagDocs.get(name) } : {}),
        })),
      }
      : {}),
    ...(tagGroups.length > 0 ? { 'x-tagGroups': tagGroups } : {}),
    ...(versions.size > 0
      ? { 'x-versions': [...versions].sort(byNaturalVersion) }
      : {}),
    paths,
    components: {
      schemas: {
        RapidError: {
          type: 'object',
          properties: {
            code: { type: 'string', enum: Object.keys(RAPID_ERROR_CODES) },
            message: { type: 'string' },
            details: {
              type: 'object',
              description:
                'Client-safe detail — on every 4xx; dropped from 5xx in PRODUCTION.',
              additionalProperties: true,
            },
            debug: {
              type: 'object',
              description: 'DEVELOPMENT only — never sent in PRODUCTION.',
              additionalProperties: true,
            },
            requestId: { type: 'string' },
          },
          required: ['code', 'message', 'requestId'],
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
