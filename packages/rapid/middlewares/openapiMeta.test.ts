/**
 * @fileoverview Guard-carried OpenAPI metadata: `app.route()` documents the
 * requirement a stamped guard enforces, an explicit `security` wins, and
 * the declared schemes reach the assembled document.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import type { RapidHTTPMiddleware } from '../types/mod.ts';
import { buildOpenApi } from '../utils/mod.ts';
import { markOpenApi, middlewareOpenApi } from './openapiMeta.ts';

const pass: RapidHTTPMiddleware = async (_ctx, next) => await next();
const guard = markOpenApi<RapidHTTPMiddleware>(
  async (_ctx, next) => await next(),
  {
    security: ['tokenAuth'],
    securitySchemes: {
      tokenAuth: { type: 'apiKey', in: 'header', name: 'x-token' },
    },
  },
);

describe('rapid.middlewares.openapiMeta', () => {
  it('a stamped guard fills security + schemes; a plain middleware adds nothing; explicit security wins', async () => {
    const app = await Application.initialize({
      name: 'openapi-meta',
      server: { port: 0 },
      logger: { handlers: [] },
    });
    app.get('/guarded', guard, () => ({ content: {} }));
    app.get('/plain', pass, () => ({ content: {} }));
    app.get(
      '/explicit',
      { openapi: { security: [] } },
      guard,
      () => ({ content: {} }),
    );
    const [guarded, plain, explicit] = app.routes;
    asserts.assertEquals(guarded!.openapi?.security, ['tokenAuth']);
    asserts.assertEquals(
      Object.keys(guarded!.openapi?.securitySchemes ?? {}),
      ['tokenAuth'],
    );
    asserts.assertEquals(plain!.openapi, undefined);
    asserts.assertEquals(explicit!.openapi?.security, []);
    asserts.assertEquals(middlewareOpenApi(pass), undefined);

    const doc = buildOpenApi(app.routes);
    const paths = doc.paths as Record<
      string,
      Record<string, { security?: unknown }>
    >;
    asserts.assertEquals(paths['/guarded']!.get!.security, [{ tokenAuth: [] }]);
    const schemes =
      (doc.components as { securitySchemes: Record<string, unknown> })
        .securitySchemes;
    asserts.assertEquals(schemes.tokenAuth, {
      type: 'apiKey',
      in: 'header',
      name: 'x-token',
    });
    await app.stop();
  });
});
