/**
 * @fileoverview `ctx.accepts()` — content negotiation wired from the request's
 * Accept header through to the handler.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';

describe('rapid.Application ctx.accepts()', () => {
  it('negotiates the response type from the Accept header', async () => {
    const app = await Application.initialize({
      name: 'neg',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.get('/data', (ctx) => ({
      content: { type: ctx.accepts('application/json', 'text/html') ?? null },
    }));

    const html = await app.fetch(
      new Request('http://app/data', { headers: { accept: 'text/html' } }),
    );
    asserts.assertEquals((await html.json()).type, 'text/html');

    const json = await app.fetch(
      new Request('http://app/data', {
        headers: { accept: 'application/json' },
      }),
    );
    asserts.assertEquals((await json.json()).type, 'application/json');

    // Client accepts neither offer → undefined (null over JSON).
    const none = await app.fetch(
      new Request('http://app/data', { headers: { accept: 'text/plain' } }),
    );
    asserts.assertEquals((await none.json()).type, null);
  });
});
