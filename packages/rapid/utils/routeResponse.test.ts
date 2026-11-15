/**
 * @fileoverview Tests for `server.requireResponse` and the reply kinds a
 * route names in place of a schema.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { health, openapi } from '../endpoints/mod.ts';
import { assembleOpenApi } from '../endpoints/openapi.ts';
import type { RapidApplicationOptions } from '../types/mod.ts';
import { html, template } from '../ui/html.ts';

const Page = template<Record<string, unknown>>(() => html`<p>page</p>`, 'Page');
const Thing = { parse: (value: unknown) => value, toOpenAPI: () => ({}) };

const boot = (options: Partial<RapidApplicationOptions> = {}) =>
  Application.initialize({
    name: 'responses',
    mode: 'DEVELOPMENT',
    logger: { handlers: [] },
    ...options,
  });

const get = async (app: Application, path: string) =>
  await app.fetch(new Request(`http://app${path}`));

describe('rapid.utils.routeResponse', () => {
  it('DEVELOPMENT refuses to serve until every data route declares a response, and names them all', async () => {
    const app = await boot();
    app.get('/declared', { response: Thing }, () => ({ content: {} }));
    app.get('/gone', { response: 'none' }, () => {});
    app.get('/healthz', health());
    app.get('/openapi.json', openapi());
    app.get('/form', { uiOnly: true }, () => ({ content: {} }));
    app.get(
      '/page',
      { template: { render: Page, prefer: 'html' } },
      () => ({ content: {} }),
    );
    // A templated route that answers JSON by default is a data route.
    app.get('/both', { template: Page }, () => ({ content: {} }));
    app.post('/bare', () => ({ content: {} }));
    const error = await asserts.assertRejects(() => get(app, '/declared'));
    asserts.assertEquals(
      (error as { context: { details: unknown } }).context.details,
      { routes: ['GET /both', 'POST /bare'] },
    );
    // Still refused on the next request: the app never half-serves.
    await asserts.assertRejects(() => get(app, '/declared'));
  });

  it('a page answers JSON once the app has an api surface, so it then needs a response', async () => {
    const app = await boot({ server: { api: { prefix: '/api' } } });
    app.get(
      '/page',
      { template: { render: Page, prefer: 'html' } },
      () => ({ content: {} }),
    );
    const error = await asserts.assertRejects(() => get(app, '/page'));
    asserts.assertStringIncludes((error as Error).message, 'GET /page');
  });

  it('PRODUCTION serves and warns once; requireResponse: false asks nothing; a non-boolean is refused', async () => {
    const app = await boot({ mode: 'PRODUCTION' });
    const lines: string[] = [];
    (app.log as unknown as { warn: (message: string) => void }).warn = (
      message,
    ) => void lines.push(message);
    app.get('/bare', () => ({ content: { ok: true } }));
    asserts.assertEquals((await get(app, '/bare')).status, 200);
    await (await get(app, '/bare')).body?.cancel();
    asserts.assertEquals(
      lines.filter((line) => line.includes('GET /bare')).length,
      1,
    );

    const off = await boot({ server: { requireResponse: false } });
    off.get('/bare', () => ({ content: { ok: true } }));
    asserts.assertEquals(await (await get(off, '/bare')).json(), { ok: true });

    await asserts.assertRejects(
      () => boot({ server: { requireResponse: 'no' as never } }),
      Error,
      'server.requireResponse must be a boolean',
    );
  });

  it('a reply kind is documented as that kind, and DEVELOPMENT rejects a success reply of another kind', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    const routes = (app: Application) => {
      app.delete('/none', { response: 'none' }, () => {});
      app.get('/text', { response: 'text' }, () => ({ content: 'hi' }));
      app.get('/bytes', { response: 'bytes' }, () => ({ content: bytes }));
      app.get('/stream', { response: 'stream' }, () => ({ content: stream() }));
      app.get(
        '/redirect',
        { response: 'redirect' },
        () => ({ content: '', redirect: '/text' }),
      );
      // Each of these answers something other than what it declares.
      app.get('/wrong/none', { response: 'none' }, () => ({ content: {} }));
      app.get('/wrong/text', { response: 'text' }, () => ({ content: {} }));
      app.get('/wrong/bytes', { response: 'bytes' }, () => ({ content: 'x' }));
      app.get('/wrong/stream', { response: 'stream' }, () => ({
        content: bytes,
      }));
      app.get('/wrong/redirect', { response: 'redirect' }, () => ({
        content: {},
      }));
      // An error reply and a redirect are not a reply of the declared kind.
      app.get('/text/failed', { response: 'text' }, () => ({
        status: 503,
        content: { status: 'down' },
      }));
      app.get('/text/moved', { response: 'text' }, () => ({
        content: '',
        redirect: '/text',
      }));
    };
    const app = await boot();
    routes(app);
    for (
      const [path, status] of [
        ['/text', 200],
        ['/bytes', 200],
        ['/stream', 200],
        ['/redirect', 302],
        ['/text/failed', 503],
        ['/text/moved', 302],
      ] as const
    ) {
      const reply = await get(app, path);
      await reply.body?.cancel();
      asserts.assertEquals(reply.status, status, path);
    }
    asserts.assertEquals(
      (await app.fetch(
        new Request('http://app/none', { method: 'DELETE' }),
      )).status,
      204,
    );
    for (const kind of ['none', 'text', 'bytes', 'stream', 'redirect']) {
      const reply = await get(app, `/wrong/${kind}`);
      asserts.assertEquals(reply.status, 500, kind);
      asserts.assertEquals(
        (await reply.json()).code,
        'RAPID_RESPONSE_INVALID',
      );
    }

    // PRODUCTION never judges the reply.
    const live = await boot({ mode: 'PRODUCTION' });
    routes(live);
    asserts.assertEquals(await (await get(live, '/wrong/text')).json(), {});

    const paths = assembleOpenApi(app, {}, new Map(), '').paths as Record<
      string,
      Record<string, { responses: Record<string, Record<string, unknown>> }>
    >;
    const ok = (path: string) => paths[path]!.get!.responses['200'];
    asserts.assertEquals(paths['/none']!.delete!.responses['200'], undefined);
    asserts.assert('204' in paths['/none']!.delete!.responses);
    asserts.assertEquals(ok('/redirect'), undefined);
    asserts.assert('3XX' in paths['/redirect']!.get!.responses);
    asserts.assertEquals(ok('/text')!.content, {
      'text/plain': { schema: { type: 'string' } },
    });
    const binary = {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    };
    asserts.assertEquals(ok('/bytes')!.content, binary);
    asserts.assertEquals(ok('/bytes')!['x-stream'], undefined);
    asserts.assertEquals(ok('/stream')!.content, binary);
    asserts.assertEquals(ok('/stream')!['x-stream'], true);
  });

  it('a misspelt reply kind is refused where the route is registered', async () => {
    const app = await boot();
    asserts.assertThrows(
      () => app.get('/x', { response: 'steam' as never }, () => {}),
      Error,
      "'stream'",
    );
  });
});
