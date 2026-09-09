/**
 * @fileoverview `buildOpenApi` — the assembler in isolation: version
 * filtering, query/header parameter binds, the declared response schema,
 * and info pass-through.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { buildOpenApi } from './mod.ts';

/** The path→operation map, shaped for the assertions below. */
type Paths = Record<
  string,
  Record<string, {
    parameters?: { name: string; in: string }[];
    responses: Record<
      string,
      { content: { 'application/json': { schema: unknown } } }
    >;
  }>
>;

describe('rapid.utils.buildOpenApi', () => {
  it('version filter: only the requested version (+ unversioned) survives', () => {
    const doc = buildOpenApi(
      [
        {
          method: 'GET',
          path: '/only-v1',
          middlewares: [],
          handler: () => ({}),
          version: 'v1',
        },
        {
          method: 'GET',
          path: '/only-v2',
          middlewares: [],
          handler: () => ({}),
          version: 'v2',
        },
      ] as never,
      { version: 'v1' },
    );
    const paths = doc.paths as Paths;
    asserts.assert('/only-v1' in paths, 'v1 route must be present');
    asserts.assert(!('/only-v2' in paths), 'v2 route must be filtered out');
  });

  it('query + header binds become in:query / in:header parameters', () => {
    const doc = buildOpenApi(
      [
        {
          method: 'GET',
          path: '/search',
          middlewares: [],
          handler: () => ({}),
          openapi: {
            binds: [
              { source: 'query', name: 'q' },
              { source: 'header', name: 'x-h' },
            ],
          },
        },
      ] as never,
      {},
    );
    const params = (doc.paths as Paths)['/search']!.get!.parameters ?? [];
    asserts.assert(
      params.some((p) => p.name === 'q' && p.in === 'query'),
      'query bind must map to in:query',
    );
    asserts.assert(
      params.some((p) => p.name === 'x-h' && p.in === 'header'),
      'header bind must map to in:header',
    );
  });

  it("response.toOpenAPI() overrides the default {type:'object'} 200 schema", () => {
    const doc = buildOpenApi(
      [
        {
          method: 'GET',
          path: '/list',
          middlewares: [],
          handler: () => ({}),
          openapi: { response: { toOpenAPI: () => ({ type: 'array' }) } },
        },
        {
          method: 'GET',
          path: '/plain',
          middlewares: [],
          handler: () => ({}),
        },
      ] as never,
      {},
    );
    const paths = doc.paths as Paths;
    const schema = paths['/list']!.get!.responses['200']!
      .content['application/json'].schema;
    asserts.assertEquals(schema, { type: 'array' });
    // A route without a declared response keeps the default.
    const fallback = paths['/plain']!.get!.responses['200']!
      .content['application/json'].schema;
    asserts.assertEquals(fallback, { type: 'object' });
  });

  it("a templated route's 200 lists BOTH application/json and text/html; a plain route only JSON", () => {
    const doc = buildOpenApi(
      [
        {
          method: 'GET',
          path: '/page',
          middlewares: [],
          handler: () => ({}),
          template: { render: { name: 'T', render: () => '' } },
        },
        { method: 'GET', path: '/api', middlewares: [], handler: () => ({}) },
      ] as never,
      {},
    );
    const paths = doc.paths as Record<
      string,
      Record<
        string,
        { responses: Record<string, { content: Record<string, unknown> }> }
      >
    >;
    asserts.assertEquals(
      Object.keys(paths['/page']!['get']!.responses['200']!.content).sort(),
      ['application/json', 'text/html'],
    );
    asserts.assertEquals(
      Object.keys(paths['/api']!['get']!.responses['200']!.content),
      ['application/json'],
    );
  });

  it('info.description passes through to the document', () => {
    const doc = buildOpenApi([], { info: { description: 'The blog API' } });
    asserts.assertEquals(
      (doc.info as { description?: string }).description,
      'The blog API',
    );
  });

  it('summary/description/operationId/tags map to their own fields; a version is x-version, never a tag', () => {
    const doc = buildOpenApi(
      [{
        method: 'GET',
        path: '/u',
        middlewares: [],
        handler: () => ({}),
        version: 'v2',
        openapi: {
          summary: 'List users',
          description: 'All of them, paged.',
          operationId: 'Users_list',
          tags: ['Users', 'Directory'],
        },
      }] as never,
    );
    const op =
      (doc.paths as Record<string, Record<string, Record<string, unknown>>>)[
        '/u'
      ]!.get!;
    asserts.assertEquals(op.summary, 'List users');
    asserts.assertEquals(op.description, 'All of them, paged.');
    asserts.assertEquals(op.operationId, 'Users_list');
    asserts.assertEquals(op.tags, ['Users', 'Directory']);
    asserts.assertEquals(op['x-version'], 'v2');
    asserts.assertEquals(doc['x-versions'], ['v2']);
  });

  it('security names become requirements and declare bearerAuth; [] stays public; custom schemes merge', () => {
    const routes = [
      {
        method: 'GET',
        path: '/secure',
        middlewares: [],
        handler: () => ({}),
        openapi: { security: ['bearerAuth'] },
      },
      {
        method: 'GET',
        path: '/public',
        middlewares: [],
        handler: () => ({}),
        openapi: { security: [] },
      },
    ] as never;
    const doc = buildOpenApi(routes);
    const paths = doc.paths as Record<
      string,
      Record<string, { security?: unknown }>
    >;
    asserts.assertEquals(paths['/secure']!.get!.security, [{ bearerAuth: [] }]);
    asserts.assertEquals(paths['/public']!.get!.security, []);
    const schemes =
      (doc.components as { securitySchemes?: Record<string, unknown> })
        .securitySchemes!;
    asserts.assertEquals(schemes.bearerAuth, {
      type: 'http',
      scheme: 'bearer',
    });
    // A custom scheme merges over the default.
    const custom = buildOpenApi(routes, {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
    });
    const merged =
      (custom.components as { securitySchemes: Record<string, unknown> })
        .securitySchemes;
    asserts.assert('bearerAuth' in merged && 'apiKey' in merged);
    // No secured route and no declared scheme → no securitySchemes at all.
    const plain = buildOpenApi([routes[1]] as never);
    asserts.assertEquals(
      (plain.components as { securitySchemes?: unknown }).securitySchemes,
      undefined,
    );
  });

  it('payload(Schema) documents the request body; a bare validator keeps the object default', () => {
    const doc = buildOpenApi(
      [
        {
          method: 'POST',
          path: '/typed',
          middlewares: [],
          handler: () => ({}),
          openapi: {
            binds: [{
              source: 'payload',
              schema: {
                toOpenAPI: () => ({ type: 'object', required: ['email'] }),
              },
            }],
          },
        },
        {
          method: 'POST',
          path: '/bare',
          middlewares: [],
          handler: () => ({}),
          openapi: {
            binds: [{ source: 'payload', validate: (v: unknown) => v }],
          },
        },
      ] as never,
    );
    const body = (p: string) =>
      (doc.paths as Record<
        string,
        Record<string, {
          requestBody: {
            required: boolean;
            content: { 'application/json': { schema: unknown } };
          };
        }>
      >)[p]!.post!.requestBody;
    asserts.assertEquals(body('/typed').content['application/json'].schema, {
      type: 'object',
      required: ['email'],
    });
    asserts.assertEquals(body('/typed').required, true);
    asserts.assertEquals(body('/bare').content['application/json'].schema, {
      type: 'object',
    });
  });

  it('module identity aggregates into top-level tags (with descriptions) and namespace tag groups; ungrouped → Other', () => {
    const doc = buildOpenApi(
      [
        {
          method: 'GET',
          path: '/users',
          middlewares: [],
          handler: () => ({}),
          openapi: {
            tags: ['Users'],
            module: {
              name: 'Users',
              namespace: 'people',
              description: 'User directory',
            },
          },
        },
        {
          method: 'GET',
          path: '/roles',
          middlewares: [],
          handler: () => ({}),
          openapi: {
            tags: ['Roles'],
            module: { name: 'Roles', namespace: 'people' },
          },
        },
        {
          method: 'GET',
          path: '/ping',
          middlewares: [],
          handler: () => ({}),
          openapi: { tags: ['Ops'], module: { name: 'Ops' } },
        },
      ] as never,
    );
    asserts.assertEquals(doc.tags, [
      { name: 'Users', description: 'User directory' },
      { name: 'Roles' },
      { name: 'Ops' },
    ]);
    asserts.assertEquals(doc['x-tagGroups'], [
      { name: 'people', tags: ['Users', 'Roles'] },
      { name: 'Other', tags: ['Ops'] },
    ]);
    // No modules at all → neither aggregate is emitted.
    const bare = buildOpenApi(
      [{
        method: 'GET',
        path: '/',
        middlewares: [],
        handler: () => ({}),
      }] as never,
    );
    asserts.assertEquals(bare.tags, undefined);
    asserts.assertEquals(bare['x-tagGroups'], undefined);
  });

  it('a CUSTOM tag that differs from the module name reaches the catalog and its namespace group (regression: was hidden)', () => {
    const doc = buildOpenApi(
      [{
        method: 'GET',
        path: '/u',
        middlewares: [],
        handler: () => ({}),
        openapi: {
          // Operation tag is NOT the module name — the case the old code dropped.
          tags: ['User Management'],
          module: {
            name: 'Users',
            namespace: 'api',
            description: 'People',
          },
        },
      }] as never,
    );
    // The custom tag is in the catalog and the `api` group — not the bare name.
    asserts.assertEquals(doc.tags, [{ name: 'User Management' }]);
    asserts.assertEquals(doc['x-tagGroups'], [{
      name: 'api',
      tags: ['User Management'],
    }]);
    // The module description has no name-tag in use, so it attaches to nothing
    // rather than inventing an orphan 'Users' tag.
    asserts.assert(
      !(doc.tags as { name: string }[]).some((t) => t.name === 'Users'),
    );
  });

  it('response schema honors toJSONSchema when toOpenAPI is absent (parity with the request body)', () => {
    const doc = buildOpenApi(
      [{
        method: 'GET',
        path: '/r',
        middlewares: [],
        handler: () => ({}),
        openapi: { response: { toJSONSchema: () => ({ type: 'array' }) } },
      }] as never,
    );
    const schema = (doc.paths as Record<
      string,
      Record<string, {
        responses: Record<
          string,
          { content: { 'application/json': { schema: unknown } } }
        >;
      }>
    >)['/r']!.get!.responses['200']!.content['application/json'].schema;
    asserts.assertEquals(schema, { type: 'array' });
  });

  it('x-versions lists EVERY declared version even when the document is filtered to one', () => {
    const doc = buildOpenApi(
      [
        {
          method: 'GET',
          path: '/a',
          middlewares: [],
          handler: () => ({}),
          version: 'v1',
        },
        {
          method: 'GET',
          path: '/b',
          middlewares: [],
          handler: () => ({}),
          version: 'v2',
        },
      ] as never,
      { version: 'v1' },
    );
    asserts.assert(!('/b' in (doc.paths as object)));
    asserts.assertEquals(doc['x-versions'], ['v1', 'v2']);
  });

  it('x-versions sorts naturally: v2 before v10 (not lexicographic)', () => {
    const doc = buildOpenApi(
      (['v10', 'v2', 'v1'] as const).map((v) => ({
        method: 'GET',
        path: `/${v}`,
        middlewares: [],
        handler: () => ({}),
        version: v,
      })) as never,
    );
    asserts.assertEquals(doc['x-versions'], ['v1', 'v2', 'v10']);
  });
});
