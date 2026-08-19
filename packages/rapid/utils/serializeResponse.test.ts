/**
 * @fileoverview serializeResponse — content → Response (the outbound
 * mirror of parseBody).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { serializeResponse } from './serializeResponse.ts';

describe('rapid.serializeResponse', () => {
  it('R2-M5: null-body statuses with content drop the body, never throw', async () => {
    // Only 204/304 were special-cased, so a handler setting
    // { status: 205, content: {...} } threw inside respond() and
    // surfaced as a 500 instead of the empty 205 it asked for.
    for (const status of [204, 205, 304] as const) {
      const response = serializeResponse({ a: 1 }, status, new Headers());
      asserts.assertEquals(response.status, status);
      asserts.assertEquals(await response.text(), '');
      asserts.assertEquals(response.headers.get('content-type'), null);
    }
  });

  it('string → text/plain', async () => {
    const r = serializeResponse('hi', 200, new Headers());
    asserts.assertEquals(r.status, 200);
    asserts.assert(r.headers.get('content-type')!.startsWith('text/plain'));
    asserts.assertEquals(await r.text(), 'hi');
  });

  it('object → JSON, serialised once', async () => {
    const r = serializeResponse({ a: 1 }, 200, new Headers());
    asserts.assertEquals(r.headers.get('content-type'), 'application/json');
    asserts.assertEquals(await r.json(), { a: 1 });
  });

  it('Uint8Array → octet-stream', async () => {
    const r = serializeResponse(new Uint8Array([1, 2, 3]), 200, new Headers());
    asserts.assertEquals(
      r.headers.get('content-type'),
      'application/octet-stream',
    );
    asserts.assertEquals(
      new Uint8Array(await r.arrayBuffer()),
      new Uint8Array([1, 2, 3]),
    );
  });

  it('null content with default status → 204 No Content', async () => {
    const r = serializeResponse(null, 200, new Headers());
    asserts.assertEquals(r.status, 204);
    asserts.assertEquals(await r.text(), '');
  });

  it('null content with an explicit status honours it (empty body)', async () => {
    const r = serializeResponse(null, 201, new Headers());
    asserts.assertEquals(r.status, 201);
    asserts.assertEquals(await r.text(), '');
  });

  it('204/304 drop body and content-type', async () => {
    const r = serializeResponse({ a: 1 }, 204, new Headers());
    asserts.assertEquals(r.status, 204);
    asserts.assertEquals(r.headers.get('content-type'), null);
    asserts.assertEquals(await r.text(), '');
  });

  it('an existing content-type is never overwritten', () => {
    const h = new Headers({ 'content-type': 'application/problem+json' });
    const r = serializeResponse({ a: 1 }, 200, h);
    asserts.assertEquals(
      r.headers.get('content-type'),
      'application/problem+json',
    );
  });
});
