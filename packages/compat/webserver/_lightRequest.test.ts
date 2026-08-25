/**
 * @fileoverview Fidelity tests for `LightRequest` — the Node inbound
 * `Request`-shaped view. Every member is checked against a real `Request` built
 * from identical inputs, so any drift from Fetch semantics fails here. The type
 * is Node-only in production, but constructs on any runtime (it needs only
 * `URL`/`Headers`/`Request`), so this runs on all three lanes.
 *
 * Assertions are throw-based (mirroring `WebServer.test.ts`) to stay free of the
 * `@std/asserts` specifier, which compat resolves only on the Deno lane.
 *
 * @module
 */

import { describe, it } from '../test.ts';
import { nodeLightRequest } from './_lightRequest.ts';

/** Throw unless `actual` deep-equals `expected` (JSON-comparable values). */
const eq = (actual: unknown, expected: unknown, msg: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
};

/** A fresh body stream per call (a stream can only be read once). */
const stream = (text: string): ReadableStream<Uint8Array> =>
  new Response(text).body!;

describe('WebServer.LightRequest', () => {
  it('is an instanceof Request', () => {
    const r = nodeLightRequest('GET', 'http://x/a', [], null);
    if (!(r instanceof Request)) throw new Error('not instanceof Request');
  });

  it('exposes method/url/headers/body as a real Request would', () => {
    const headers: [string, string][] = [['x-custom', 'v'], ['accept', '*/*']];
    const light = nodeLightRequest('GET', 'http://x/a?b=1', headers, null);
    const real = new Request('http://x/a?b=1', { method: 'GET', headers });

    eq(light.method, real.method, 'method');
    eq(light.url, real.url, 'url');
    eq(light.headers.get('x-custom'), real.headers.get('x-custom'), 'header');
    eq(light.body, null, 'GET body is null');
    eq(light.bodyUsed, false, 'bodyUsed starts false');
  });

  it('normalizes the URL identically to a real Request', () => {
    const raw = 'http://x/a//b/../c?z=1';
    eq(
      nodeLightRequest('GET', raw, [], null).url,
      new Request(raw).url,
      'normalized url',
    );
  });

  it('accumulates duplicate header values like Headers does', () => {
    const pairs: [string, string][] = [['x-a', '1'], ['x-a', '2']];
    eq(
      nodeLightRequest('GET', 'http://x/', pairs, null).headers.get('x-a'),
      new Headers(pairs).get('x-a'),
      'duplicate header join',
    );
  });

  it('throws at construction on a malformed URL (→ 400 before dispatch)', () => {
    let threw = false;
    try {
      nodeLightRequest('GET', 'http://exa mple/', [], null);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected a throw on malformed URL');
  });

  it('reads the body via text()', async () => {
    const r = nodeLightRequest(
      'POST',
      'http://x/',
      [['content-type', 'text/plain']],
      stream('hello'),
    );
    eq(await r.text(), 'hello', 'text body');
  });

  it('reads the body via json()', async () => {
    const r = nodeLightRequest(
      'POST',
      'http://x/',
      [['content-type', 'application/json']],
      stream(JSON.stringify({ a: 1 })),
    );
    eq(await r.json(), { a: 1 }, 'json body');
  });

  it('reads the body via arrayBuffer()', async () => {
    const r = nodeLightRequest('POST', 'http://x/', [], stream('abc'));
    const buf = await r.arrayBuffer();
    eq([...new Uint8Array(buf)], [97, 98, 99], 'arrayBuffer body');
  });

  it('parses a urlencoded body via formData()', async () => {
    const r = nodeLightRequest(
      'POST',
      'http://x/',
      [['content-type', 'application/x-www-form-urlencoded']],
      stream('name=ada&role=eng'),
    );
    const form = await r.formData();
    eq(form.get('name'), 'ada', 'formData name');
    eq(form.get('role'), 'eng', 'formData role');
  });

  it('clone() yields an independently readable Request', async () => {
    const r = nodeLightRequest('POST', 'http://x/', [], stream('dup'));
    const copy = r.clone();
    eq(await r.text(), 'dup', 'original body');
    eq(await copy.text(), 'dup', 'clone body');
  });

  it('materializes delegated Fetch fields (signal)', () => {
    const r = nodeLightRequest('GET', 'http://x/', [], null);
    if (!(r.signal instanceof AbortSignal)) {
      throw new Error('signal is not an AbortSignal');
    }
  });
});
