/**
 * @fileoverview HTTPContext.payload / .rawPayload — read-order independence.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { HTTPContext } from './HTTPContext.ts';

const app = await Application.initialize({
  name: 'payload-order',
  server: { port: 0 },
  logger: { handlers: [] },
});
const post = (body: string, type = 'application/json') =>
  new HTTPContext(app, {
    request: new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': type },
      body,
    }),
    remoteAddress: '127.0.0.1',
  });
const text = (bytes: Uint8Array | null) =>
  bytes === null ? null : new TextDecoder().decode(bytes);

describe('rapid.HTTPContext.payload order', () => {
  it('rawPayload is the same bytes whether read before or after payload', async () => {
    const first = post('{"a":1}');
    asserts.assertEquals(text(await first.rawPayload), '{"a":1}');
    asserts.assertEquals(await first.payload, { a: 1 });

    const second = post('{"a":1}');
    asserts.assertEquals(await second.payload, { a: 1 });
    asserts.assertEquals(text(await second.rawPayload), '{"a":1}');
  });

  it('a form body parses from the raw bytes too, and a replaced payload leaves the raw bytes alone', async () => {
    const form = post('a=1&b=2', 'application/x-www-form-urlencoded');
    asserts.assertEquals(await form.payload, { a: '1', b: '2' });
    asserts.assertEquals(text(await form.rawPayload), 'a=1&b=2');

    const sealed = post('ciphertext', 'application/jose');
    asserts.assertEquals(text(await sealed.rawPayload), 'ciphertext');
    sealed._replacePayload(new TextEncoder().encode('{"open":true}'));
    asserts.assertEquals(await sealed.payload, { open: true });
    asserts.assertEquals(text(await sealed.rawPayload), 'ciphertext');
  });

  it('a request without a body yields null bytes', async () => {
    const ctx = new HTTPContext(app, {
      request: new Request('http://localhost/x'),
      remoteAddress: '127.0.0.1',
    });
    asserts.assertEquals(await ctx.rawPayload, null);
  });
});
