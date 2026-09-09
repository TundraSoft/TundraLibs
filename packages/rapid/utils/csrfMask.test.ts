/**
 * @fileoverview csrfMask — every mask of a token is different and all of
 * them unmask to it; malformed masked values are invalid, never a throw.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { maskToken, unmaskToken } from './csrfMask.ts';

describe('rapid.utils.csrfMask', () => {
  const token = '01J8Z3NQ5Y4M6W2K7P9R1S3T5V.abcdef0123456789.0f1e2d3c';

  it('masks differently on every call and unmasks back to the token', () => {
    const a = maskToken(token);
    const b = maskToken(token);
    asserts.assertNotEquals(a, b);
    asserts.assert(!a.includes(token.slice(0, 8)), 'no token bytes in clear');
    asserts.assertEquals(unmaskToken(a), token);
    asserts.assertEquals(unmaskToken(b), token);
    asserts.assertMatch(a, /^[0-9a-f]+~[0-9a-f]+$/);
  });

  it('a bare token passes through unmask untouched', () => {
    asserts.assertEquals(unmaskToken(token), token);
  });

  it('a malformed masked value is undefined: odd length, non-hex, mismatched halves, empty', () => {
    for (
      const bad of [
        'abc~abcd',
        'zz~zz',
        'abcd~ab',
        '~',
        'ab~',
        '~ab',
      ]
    ) {
      asserts.assertEquals(unmaskToken(bad), undefined, bad);
    }
  });

  it('a flipped byte in the masked half unmasks to a DIFFERENT token (the signature check catches it)', () => {
    const masked = maskToken(token);
    const at = masked.indexOf('~') + 1;
    const flipped = masked.slice(0, at) +
      (masked[at] === '0' ? '1' : '0') + masked.slice(at + 1);
    asserts.assertNotEquals(unmaskToken(flipped), token);
  });
});
