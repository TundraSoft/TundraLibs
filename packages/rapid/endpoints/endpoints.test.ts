/**
 * @fileoverview The ready-made endpoints + the metrics recording behind
 * them + the OpenAPI assembler — over app.fetch.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { health, login, metrics, openapi } from './mod.ts';
import { buildOpenApi } from '../utils/mod.ts';

const make = (metricsOn = false) =>
  new Application({
    name: 'endpoints-test',
    mode: 'DEVELOPMENT',
    server: { port: 0, hostname: '127.0.0.1', metrics: metricsOn },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-endpoints-test' },
  });

describe('rapid.endpoints', () => {
  it('metrics(): 503 when off; Prometheus text once server.metrics records traffic', async () => {
    const off = make(false);
    off.get('/metrics', metrics());
    asserts.assertEquals(
      (await off.fetch(new Request('http://app/metrics'))).status,
      503,
    );
    await off.stop();

    const on = make(true);
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
    const app = make(true);
    app.get('/x', () => ({ content: 'x' }));
    app.get('/metrics', metrics({ format: 'json' }));
    await app.fetch(new Request('http://app/x'));
    const body = await (await app.fetch(new Request('http://app/metrics')))
      .json();
    asserts.assert(typeof body === 'object' && body !== null);
    await app.stop();
  });

  it('health(): 200 ok with the instance id; 503 when the check throws', async () => {
    const app = make();
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
    asserts.assertEquals((await bad.json()).reason, 'db down');
    await app.stop();
  });

  it('login(pact): 200 + token on success, 401 on a null login', async () => {
    const pact = {
      login: (_s: string, creds: unknown) =>
        Promise.resolve(
          (creds as { user?: string }).user === 'ada'
            ? { principal: { id: 'ada' }, token: 'jwt-123' }
            : null,
        ),
    };
    const app = make();
    app.post('/login', login({ pact }));
    const ok = await app.fetch(
      new Request('http://app/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user: 'ada' }),
      }),
    );
    asserts.assertEquals([ok.status, (await ok.json()).token], [
      200,
      'jwt-123',
    ]);
    const bad = await app.fetch(
      new Request('http://app/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user: 'x' }),
      }),
    );
    asserts.assertEquals(bad.status, 401);
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
      Record<string, { summary?: string; parameters?: unknown[] }>
    >;
    asserts.assert('/posts/{id}' in paths); // :id: → {id}
    asserts.assertEquals(paths['/posts/{id}']!.get!.summary, 'One post');
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
    const app = make();
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
    asserts.assertEquals(
      (await app.fetch(new Request('http://app/hidden.json'))).status,
      404,
    );
    await app.stop();
  });
});
