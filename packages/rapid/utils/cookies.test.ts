/**
 * @fileoverview parseCookies / serializeCookie.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { parseCookies, serializeCookie } from './cookies.ts';

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
    asserts.assertThrows(
      () => serializeCookie('bad name', 'v'),
      Error,
      'Invalid cookie name',
    );
    asserts.assertThrows(() => serializeCookie('a=b', 'v'), Error);
  });
});
