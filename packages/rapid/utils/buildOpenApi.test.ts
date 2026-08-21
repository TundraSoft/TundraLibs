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

  it('info.description passes through to the document', () => {
    const doc = buildOpenApi([], { info: { description: 'The blog API' } });
    asserts.assertEquals(
      (doc.info as { description?: string }).description,
      'The blog API',
    );
  });
});
