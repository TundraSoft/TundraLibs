/**
 * @fileoverview parseCookies / serializeCookie.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  parseCookies,
  serializeCookie,
  signValue,
  verifySignedValue,
} from './cookies.ts';
import { RapidError } from '../errors/mod.ts';

describe('rapid.cookies', () => {
  it('parses a Cookie header (decoding values, skipping junk)', () => {
    asserts.assertEquals(
      parseCookies('a=1; b=two; c=%20sp%3Bace'),
      { a: '1', b: 'two', c: ' sp;ace' },
    );
    asserts.assertEquals(parseCookies(null), {});
    asserts.assertEquals(parseCookies(''), {});
    // A bare token with no '=' is skipped, not crashed.
    asserts.assertEquals(parseCookies('x=1; nonsense; y=2'), {
      x: '1',
      y: '2',
    });
    // Quoted value is unwrapped.
    asserts.assertEquals(parseCookies('q="hi"'), { q: 'hi' });
  });

  it('serializes value + attributes (value encoded)', () => {
    asserts.assertEquals(serializeCookie('sid', 'abc'), 'sid=abc');
    asserts.assertEquals(
      serializeCookie('sid', 'a b;c', {
        maxAge: 3600,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      }),
      'sid=a%20b%3Bc; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax',
    );
  });

  it('rejects an illegal cookie name (no header injection)', () => {
    const err = asserts.assertThrows(
      () => serializeCookie('bad name', 'v'),
      RapidError,
      'Invalid cookie name',
    ) as RapidError;
    asserts.assertEquals(err.code, 'RAPID_RESPONSE_INVALID');
    asserts.assertThrows(() => serializeCookie('a=b', 'v'), RapidError);
  });
});

describe('rapid.cookies — signed values', () => {
  const SECRET = 'test-secret-0123456789-abcdefghijklmnop';

  it('a value signed under one cookie NAME never verifies under another', async () => {
    const signed = await signValue('alice', SECRET, 'pref');
    asserts.assertEquals(
      await verifySignedValue(signed, SECRET, 'pref'),
      'alice',
    );
    asserts.assertEquals(
      await verifySignedValue(signed, SECRET, 'uid'),
      undefined,
    );
    // Unbound (token) form stays self-consistent and distinct from the bound one.
    const bare = await signValue('alice', SECRET);
    asserts.assertEquals(await verifySignedValue(bare, SECRET), 'alice');
    asserts.assertEquals(
      await verifySignedValue(bare, SECRET, 'pref'),
      undefined,
    );
  });

  it('an EMPTY signed value round-trips (and is distinguishable from a forgery)', async () => {
    const signed = await signValue('', SECRET, 'flag');
    asserts.assertEquals(await verifySignedValue(signed, SECRET, 'flag'), '');
    asserts.assertEquals(
      await verifySignedValue('.deadbeef', SECRET, 'flag'),
      undefined,
    );
    asserts.assertEquals(
      await verifySignedValue(undefined, SECRET, 'flag'),
      undefined,
    );
  });

  it('serializeCookie rejects a Max-Age outside 0..400 days or non-integer', () => {
    for (const maxAge of [-1, 1.5, 400 * 24 * 3600 + 1]) {
      asserts.assertThrows(
        () => serializeCookie('a', 'b', { maxAge }),
        RapidError,
        'maxAge',
      );
    }
    asserts.assertStringIncludes(
      serializeCookie('a', 'b', { maxAge: 0 }),
      'Max-Age=0',
    );
  });
});
