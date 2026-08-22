/**
 * @fileoverview `server.ignoreTrailingSlash` (default true): a stray trailing
 * slash routes to the slash-less route, and the root `/` is never altered.
 * Rapid's normalisation runs before routing AND version resolution, so a
 * `path`-mode version segment is recognised on `/v1/users/` too.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';

const status = async (app: Application, path: string) =>
  (await app.fetch(new Request(`http://app${path}`))).status;

describe('rapid.Application ignoreTrailingSlash', () => {
  it('default: a stray trailing slash routes to the slash-less route; root untouched', async () => {
    const app = await Application.initialize({
      name: 'slash',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.get('/users', () => ({ content: { ok: true } }));
    asserts.assertEquals(await status(app, '/users'), 200);
    asserts.assertEquals(await status(app, '/users/'), 200); // forgiven
    asserts.assertEquals(await status(app, '/'), 404); // root untouched, unregistered here
  });

  it('normalises BEFORE path-mode version resolution, so /v1/users/ still resolves v1', async () => {
    const app = await Application.initialize({
      name: 'slash-ver',
      server: {
        port: 0,
        hostname: '127.0.0.1',
        versioning: { mode: 'path', default: 'v1' },
      },
      logger: { handlers: [] },
    });
    app.route('GET', '/users', { version: 'v1' }, () => ({
      content: { v: 'v1' },
    }));
    const r = await app.fetch(new Request('http://app/v1/users/'));
    asserts.assertEquals(r.status, 200);
    asserts.assertEquals((await r.json()).v, 'v1');
  });
});
