/**
 * @fileoverview The ready-made endpoints + the metrics recording behind
 * them + the OpenAPI assembler — over app.fetch.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import {
  docs,
  DocsAuth,
  DocsReference,
  health,
  metrics,
  openapi,
  type OpenApiSecuritySchemes,
  ready,
} from './mod.ts';
import { assertSecuritySchemes, buildOpenApi } from '../utils/mod.ts';
import { html, render, template } from '../ui/mod.ts';
import { RapidError } from '../errors/mod.ts';

const make = (metricsOn = false) =>
  Application.initialize({
    name: 'endpoints-test',
    mode: 'DEVELOPMENT',
    server: { port: 0, hostname: '127.0.0.1', metrics: metricsOn },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-endpoints-test' },
  });

describe('rapid.endpoints', () => {
  it('metrics(): 503 when off; Prometheus text once server.metrics records traffic', async () => {
    const off = await make(false);
    off.get('/metrics', metrics());
    asserts.assertEquals(
      (await off.fetch(new Request('http://app/metrics'))).status,
      503,
    );
    await off.stop();

    const on = await make(true);
    on.get('/hello', () => ({ content: 'hi' }));
    on.get('/metrics', metrics());
    await on.fetch(new Request('http://app/hello')); // record one request
    const r = await on.fetch(new Request('http://app/metrics'));
    asserts.assertEquals(r.status, 200);
    asserts.assertStringIncludes(
      r.headers.get('content-type') ?? '',
      'text/plain',
    );
    const body = await r.text();
    asserts.assertStringIncludes(body, 'rapid_requests_total');
    asserts.assertStringIncludes(body, 'transport="HTTP"');
    await on.stop();
  });

  it('metrics({ format: json }) returns the JSON collection', async () => {
    const app = await make(true);
    app.get('/x', () => ({ content: 'x' }));
    app.get('/metrics', metrics({ format: 'json' }));
    await app.fetch(new Request('http://app/x'));
    const body = await (await app.fetch(new Request('http://app/metrics')))
      .json();
    asserts.assert(typeof body === 'object' && body !== null);
    await app.stop();
  });

  it('ready(): 200 ready; 503 unhealthy when the check throws; 503 draining once stop() began', async () => {
    const app = await make();
    app.get('/readyz', ready());
    app.get(
      '/readyz-db',
      ready({
        check: () => {
          throw new Error('db down');
        },
      }),
    );
    const ok = await (await app.fetch(new Request('http://app/readyz')))
      .json();
    asserts.assertEquals(ok, { status: 'ready', instance: app.instanceId });
    const bad = await app.fetch(new Request('http://app/readyz-db'));
    asserts.assertEquals(bad.status, 503);
    asserts.assertEquals(await bad.json(), { status: 'unhealthy' });
    asserts.assertEquals(app.stopping, false);
    const stopping = app.stop();
    asserts.assertEquals(app.stopping, true);
    const draining = await app.fetch(new Request('http://app/readyz'));
    asserts.assertEquals(draining.status, 503);
    asserts.assertEquals(await draining.json(), { status: 'draining' });
    await stopping;
    asserts.assertEquals(app.stopping, false);
  });

  it('health(): 200 ok with the instance id; 503 when the check throws', async () => {
    const app = await make();
    app.get('/healthz', health());
    app.get(
      '/ready',
      health({
        check: () => {
          throw new Error('db down');
        },
      }),
    );
    const ok = await (await app.fetch(new Request('http://app/healthz')))
      .json();
    asserts.assertEquals(ok.status, 'ok');
    asserts.assertEquals(ok.instance, app.instanceId);
    const bad = await app.fetch(new Request('http://app/ready'));
    asserts.assertEquals(bad.status, 503);
    const badBody = await bad.json();
    asserts.assertEquals(badBody.status, 'unhealthy');
    // The check's error message must NOT leak to the client (it can carry
    // DSNs/hostnames/creds); it is logged server-side instead.
    asserts.assertEquals(badBody.reason, undefined);
    await app.stop();
  });

  it('buildOpenApi assembles paths, converts params, refs the error envelope', () => {
    const doc = buildOpenApi([
      {
        method: 'GET',
        path: '/posts/:id:',
        middlewares: [],
        handler: () => ({}),
        version: 'v1',
        openapi: { description: 'One post' },
      },
      {
        method: 'POST',
        path: '/posts',
        middlewares: [],
        handler: () => ({}),
        openapi: { binds: [{ source: 'payload' }] },
      },
    ] as never, { info: { title: 'Blog', version: '2.0.0' } });
    asserts.assertEquals(doc.openapi, '3.0.3');
    asserts.assertEquals((doc.info as { title: string }).title, 'Blog');
    const paths = doc.paths as Record<
      string,
      Record<string, { description?: string; parameters?: unknown[] }>
    >;
    asserts.assert('/posts/{id}' in paths); // :id: → {id}
    // `description` is the long-form field; `summary` is its own option.
    asserts.assertEquals(paths['/posts/{id}']!.get!.description, 'One post');
    asserts.assert(
      (paths['/posts/{id}']!.get!.parameters as { name: string }[]).some((p) =>
        p.name === 'id'
      ),
    );
    asserts.assert('requestBody' in (paths['/posts']!.post as object)); // payload bind
    const schemas =
      (doc.components as { schemas: Record<string, unknown> }).schemas;
    asserts.assert('RapidError' in schemas);
  });

  it('openapi() endpoint serves the doc; expose gates by mode', async () => {
    const app = await make();
    app.get('/posts', () => ({ content: { rows: [] } }));
    app.get(
      '/openapi.json',
      openapi({ servers: [{ url: 'https://api.example.com' }] }),
    );
    app.get('/hidden.json', openapi({ expose: 'PRODUCTION' })); // app is DEVELOPMENT by default
    const doc = await (await app.fetch(new Request('http://app/openapi.json')))
      .json();
    asserts.assertEquals(doc.openapi, '3.0.3');
    asserts.assert('/posts' in doc.paths);
    asserts.assertEquals(doc.servers[0].url, 'https://api.example.com');
    const hidden = await app.fetch(new Request('http://app/hidden.json'));
    asserts.assertEquals(hidden.status, 404);
    const body = await hidden.json();
    asserts.assertEquals(body.code, 'RAPID_NOT_FOUND');
    asserts.assertEquals(typeof body.requestId, 'string');
    await app.stop();
  });

  it('openapi(): ?version filters per version, plain serves all, cache-hit is byte-identical', async () => {
    const app = await make();
    app.route('GET', '/v1/thing', { version: 'v1' }, () => ({ content: {} }));
    app.route('GET', '/v2/thing', { version: 'v2' }, () => ({ content: {} }));
    app.get('/openapi.json', openapi());
    const get = (q = '') =>
      app.fetch(new Request(`http://app/openapi.json${q}`));

    const v2 = await (await get('?version=v2')).json();
    asserts.assertEquals(v2.openapi, '3.0.3');
    asserts.assert('/v2/thing' in v2.paths, 'v2 route present');
    asserts.assert(!('/v1/thing' in v2.paths), 'v1 route filtered out');

    // Second identical request hits the per-version cache — same bytes.
    const v2Again = await (await get('?version=v2')).text();
    asserts.assertEquals(JSON.stringify(v2), v2Again);

    const v1 = await (await get('?version=v1')).json();
    asserts.assertEquals(v1.openapi, '3.0.3');
    asserts.assert('/v1/thing' in v1.paths, 'v1 route present');
    asserts.assert(!('/v2/thing' in v1.paths), 'v2 route filtered out');

    const all = await (await get()).json();
    asserts.assertEquals(all.openapi, '3.0.3');
    asserts.assert('/v1/thing' in all.paths && '/v2/thing' in all.paths);

    // An unknown version must not crash and still yields a valid doc.
    const unknown = await get('?version=nope');
    asserts.assertEquals(unknown.status, 200);
    asserts.assertEquals((await unknown.json()).openapi, '3.0.3');
    await app.stop();
  });
});

describe('rapid.endpoints.securitySchemes', () => {
  const valid: OpenApiSecuritySchemes = {
    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    basic: { type: 'http', scheme: 'basic' },
    apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    oauth: {
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: 'https://idp.example.com/authorize',
          tokenUrl: 'https://idp.example.com/token',
          scopes: { read: 'Read' },
        },
      },
    },
    oidc: {
      type: 'openIdConnect',
      openIdConnectUrl:
        'https://idp.example.com/.well-known/openid-configuration',
    },
  };

  it('accepts every spec kind and merges them over bearerAuth in the document', () => {
    assertSecuritySchemes(valid);
    const doc = buildOpenApi([], { securitySchemes: valid }) as {
      components: { securitySchemes: Record<string, unknown> };
    };
    asserts.assertEquals(
      Object.keys(doc.components.securitySchemes).sort(),
      ['apiKey', 'basic', 'bearerAuth', 'oauth', 'oidc'],
    );
  });

  it('rejects a bad key, an unknown type, and each kind missing its required field (RAPID_CONFIG)', async () => {
    const bad: [string, unknown][] = [
      ['bad key', { 'my key': { type: 'http', scheme: 'bearer' } }],
      ['unknown type', { x: { type: 'mutual-tls' } }],
      ['http without scheme', { x: { type: 'http' } }],
      ['apiKey without name', { x: { type: 'apiKey', in: 'header' } }],
      ['apiKey bad in', { x: { type: 'apiKey', in: 'body', name: 'k' } }],
      ['oauth2 no flows', { x: { type: 'oauth2', flows: {} } }],
      ['oauth2 unknown flow', {
        x: { type: 'oauth2', flows: { device: { scopes: {} } } },
      }],
      ['oauth2 missing tokenUrl', {
        x: { type: 'oauth2', flows: { password: { scopes: {} } } },
      }],
      ['oauth2 bad url', {
        x: {
          type: 'oauth2',
          flows: { implicit: { authorizationUrl: 'nope', scopes: {} } },
        },
      }],
      ['oidc bad url', { x: { type: 'openIdConnect', openIdConnectUrl: '/' } }],
    ];
    for (const [label, schemes] of bad) {
      const error = asserts.assertThrows(
        () => openapi({ securitySchemes: schemes as OpenApiSecuritySchemes }),
        RapidError,
        undefined,
        label,
      );
      asserts.assertEquals(error.code, 'RAPID_CONFIG', label);
      asserts.assertStringIncludes(error.message, 'openapi()', label);
    }
    const app = await make();
    const viaDocs = asserts.assertThrows(
      () =>
        docs(app, {
          securitySchemes: {
            x: { type: 'http' },
          } as unknown as OpenApiSecuritySchemes,
        }),
      RapidError,
    );
    asserts.assertStringIncludes(viaDocs.message, 'docs()');
    await app.stop();
  });
});

describe('rapid.endpoints.docs', () => {
  const secured = async (extra: Record<string, unknown> = {}) => {
    const app = await Application.initialize({
      name: 'docs-test',
      mode: 'DEVELOPMENT',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ...extra,
    });
    app.route(
      'GET',
      '/posts/:id:',
      {
        openapi: {
          summary: 'One post',
          security: ['bearerAuth'],
          tags: ['Posts'],
        },
      },
      () => ({ content: {} }),
    );
    app.post('/posts', () => ({ content: {} }));
    return app;
  };
  const page = async (
    app: Application,
    path = '/docs',
  ): Promise<
    { status: number; body: string; flat: string; type: string }
  > => {
    const r = await app.fetch(new Request(`http://app${path}`));
    const body = await r.text();
    return {
      status: r.status,
      body,
      // The formatter breaks long tags across lines — compare collapsed.
      flat: body.replace(/\s+/g, ' '),
      type: r.headers.get('content-type') ?? '',
    };
  };

  it('default: a standalone HTML reference — nav, tagged operations, params, badges, schema anchors; no try-it', async () => {
    const app = await secured();
    docs(app, { spec: '/openapi.json' });
    const { status, body, flat, type } = await page(app);
    asserts.assertEquals(status, 200);
    asserts.assertStringIncludes(type, 'text/html');
    asserts.assert(body.startsWith('<!doctype html>'), 'full document');
    asserts.assertStringIncludes(flat, '<title>docs-test API</title>');
    asserts.assertStringIncludes(flat, 'id="tag-posts"');
    asserts.assertStringIncludes(flat, 'id="op-get-posts-id"');
    asserts.assertStringIncludes(flat, '<code>/posts/{id}</code>');
    asserts.assertStringIncludes(flat, 'One post');
    asserts.assertStringIncludes(flat, 'docs-secured">bearerAuth<');
    asserts.assertStringIncludes(flat, 'href="#schema-rapiderror"');
    asserts.assertStringIncludes(flat, 'id="schema-rapiderror"');
    asserts.assertStringIncludes(flat, 'href="/openapi.json"');
    asserts.assert(!flat.includes('data-path="/docs"'), 'not self-listed');
    asserts.assert(!body.includes('data-docs-try'), 'try-it is opt-in');
    asserts.assert(!body.includes('/__rapid/docs.js'));
    // The script route is not registered when try-it is off.
    asserts.assertEquals(
      (await app.fetch(new Request('http://app/__rapid/docs.js'))).status,
      404,
    );
    await app.stop();
  });

  it('tryIt: credential box per scheme + login form, per-operation forms, and the rapid-served script', async () => {
    const app = await secured();
    docs(app, {
      tryIt: { login: { path: '/login', fields: ['email', 'password'] } },
      securitySchemes: {
        basic: { type: 'http', scheme: 'basic' },
        key: { type: 'apiKey', in: 'query', name: 'api_key' },
        oidc: {
          type: 'openIdConnect',
          openIdConnectUrl: 'https://idp.example.com/.well-known/oidc',
        },
      },
    });
    const { body, flat } = await page(app);
    asserts.assertStringIncludes(flat, 'data-docs-auth');
    asserts.assertStringIncludes(
      flat,
      'data-docs-login="/login" data-docs-login-fields="email,password"',
    );
    asserts.assertStringIncludes(flat, 'data-docs-credential="bearerAuth"');
    asserts.assertStringIncludes(flat, 'data-docs-part="user"');
    asserts.assertStringIncludes(
      flat,
      'data-docs-in="query" data-docs-name="api_key"',
    );
    asserts.assertStringIncludes(
      flat,
      'https://idp.example.com/.well-known/oidc',
    );
    asserts.assertStringIncludes(
      flat,
      'data-method="GET" data-path="/posts/{id}" data-security="bearerAuth"',
    );
    asserts.assertStringIncludes(
      flat,
      'data-docs-param="id" data-docs-in="path"',
    );
    asserts.assertStringIncludes(flat, '<script src="/__rapid/docs.js" defer>');

    const script = await app.fetch(new Request('http://app/__rapid/docs.js'));
    asserts.assertEquals(script.status, 200);
    asserts.assertStringIncludes(
      script.headers.get('content-type') ?? '',
      'text/javascript',
    );
    asserts.assertEquals(
      script.headers.get('x-content-type-options'),
      'nosniff',
    );
    const etag = script.headers.get('etag') ?? '';
    asserts.assert(etag.length > 0);
    const source = await script.text();
    new Function(source); // parses
    asserts.assertStringIncludes(source, 'rapid.docs.credentials');
    asserts.assertStringIncludes(source, 'setCredential');
    const again = await app.fetch(
      new Request('http://app/__rapid/docs.js', {
        headers: { 'if-none-match': etag },
      }),
    );
    asserts.assertEquals(again.status, 304);
    await again.body?.cancel();
    await app.stop();
  });

  it('expose gates like openapi(); pages do not exist on an api-only app', async () => {
    const app = await secured();
    docs(app, { expose: 'PRODUCTION' });
    const hidden = await page(app);
    asserts.assertEquals(hidden.status, 404);
    asserts.assertStringIncludes(hidden.body, 'RAPID_NOT_FOUND');
    await app.stop();

    const api = await secured({ ui: { enabled: false } });
    docs(api);
    asserts.assertEquals((await page(api)).status, 404);
    await api.stop();
  });

  it('renders inside the app core/layout (no doctype of its own); layout: false skips the module tier', async () => {
    const Core = template<{ body: unknown; title?: string }>(
      (d) => html`<core title="${d.title ?? ''}">${d.body}</core>`,
      'Core',
    );
    const Shape = template<{ body: unknown; title?: string }>(
      (d) => html`<shape>${d.body}</shape>`,
      'Shape',
    );
    const app = await secured({
      ui: { prefer: 'html', core: Core, layout: Shape },
    });
    docs(app, { title: 'Ref' });
    docs(app, { path: '/docs-bare', layout: false });
    const wrapped = (await page(app)).flat;
    asserts.assert(
      wrapped.startsWith('<core title="Ref"><shape>'),
      wrapped.slice(0, 60),
    );
    asserts.assert(!wrapped.includes('<!doctype'));
    const bare = (await page(app, '/docs-bare')).flat;
    asserts.assert(
      bare.startsWith('<core title="docs-test API"><style>'),
      bare.slice(0, 60),
    );
    asserts.assert(!bare.includes('<shape>'));
    await app.stop();
  });

  it('render: composes a custom page from the exported parts', async () => {
    const app = await secured();
    docs(app, {
      tryIt: true,
      render: (doc, view, opts) =>
        html`<h1>Custom ${view.path}</h1>${DocsAuth(doc, opts)}${
          DocsReference(doc, opts)
        }`,
    });
    const { body, flat } = await page(app);
    asserts.assert(body.startsWith('<!doctype html>'));
    asserts.assertStringIncludes(flat, '<h1>Custom /docs</h1>');
    asserts.assertStringIncludes(flat, 'data-docs-auth');
    asserts.assertStringIncludes(flat, 'data-docs-try');
    asserts.assertStringIncludes(flat, '<script src="/__rapid/docs.js" defer>');
    asserts.assert(
      !body.includes('id="schemas"'),
      'schemas part not composed in',
    );
    await app.stop();
  });

  it('parts render standalone: DocsAuth explains an empty scheme set, DocsReference groups untagged routes under Other', () => {
    const doc = buildOpenApi([{
      method: 'GET',
      path: '/x',
      middlewares: [],
      handler: () => ({ content: {} }),
    }]);
    const auth = render(DocsAuth(doc as never));
    asserts.assertStringIncludes(auth, 'No security schemes are declared');
    const ref = render(DocsReference(doc as never));
    asserts.assertStringIncludes(ref, 'id="tag-other"');
    asserts.assertStringIncludes(ref, 'id="op-get-x"');
  });

  it('third-party viewers: pinned SRI shell, spec required, swagger gets its init script', async () => {
    const app = await secured();
    asserts.assertThrows(
      () => docs(app, { viewer: 'scalar' }),
      RapidError,
      'needs the JSON document URL',
    );
    asserts.assertThrows(
      () =>
        docs(app, {
          viewer: {
            kind: 'redoc',
            script: { src: 'https://x/r.js', integrity: '' },
          },
          spec: '/openapi.json',
        }),
      RapidError,
      'integrity',
    );
    asserts.assertThrows(
      () =>
        docs(app, {
          viewer: 'redoc',
          spec: '/openapi.json',
          render: () => html``,
        }),
      RapidError,
      'rapid viewer only',
    );
    docs(app, { viewer: 'scalar', spec: '/openapi.json', tryIt: true });
    docs(app, { path: '/swagger', viewer: 'swagger', spec: '/openapi.json' });
    const scalar = (await page(app)).flat;
    asserts.assert(scalar.startsWith('<!doctype html>'));
    asserts.assertStringIncludes(
      scalar,
      'id="api-reference" data-url="/openapi.json"',
    );
    asserts.assertMatch(
      scalar,
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@[\d.]+\/[^"]+" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"/,
    );
    asserts.assert(
      !scalar.includes('/__rapid/docs.js'),
      "tryIt is the rapid viewer's",
    );
    const swagger = (await page(app, '/swagger')).flat;
    asserts.assertStringIncludes(swagger, 'swagger-ui.css" integrity="sha384-');
    asserts.assertStringIncludes(
      swagger,
      '<script src="/__rapid/docs-swagger.js" defer>',
    );
    const init = await app.fetch(
      new Request('http://app/__rapid/docs-swagger.js'),
    );
    asserts.assertEquals(init.status, 200);
    new Function(await init.text());
    await app.stop();
  });
});

describe('rapid.endpoints.docs — multi-tag operations', () => {
  it('an operation carrying two tags is listed under both but documented once, with a cross-link under the second', async () => {
    const app = await Application.initialize({
      name: 'docs-tags',
      mode: 'DEVELOPMENT',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.route(
      'GET',
      '/audit',
      { openapi: { tags: ['Posts', 'Admin'] } },
      () => ({ content: {} }),
    );
    docs(app, { tryIt: true });
    try {
      const body = (await (await app.fetch(new Request('http://app/docs')))
        .text()).replace(/\s+/g, ' ');
      asserts.assertEquals(body.split('id="op-get-audit"').length - 1, 1);
      asserts.assertEquals(body.split('data-path="/audit"').length - 1, 1);
      asserts.assertStringIncludes(body, 'documented under Posts');
      // Both nav entries still point at the one article.
      asserts.assertEquals(body.split('href="#op-get-audit"').length - 1, 3);
    } finally {
      await app.stop();
    }
  });
});
