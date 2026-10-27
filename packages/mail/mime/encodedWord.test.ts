/**
 * @fileoverview Tests for RFC 2047 decoding.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { decodeEncodedWords } from './encodedWord.ts';

describe('decodeEncodedWords', () => {
  it('should decode B and Q words and keep surrounding text', () => {
    asserts.assertEquals(
      decodeEncodedWords(
        'Re: =?UTF-8?B?w6l0w6k=?= and =?utf-8?q?caf=C3=A9_au_lait?= !',
      ),
      'Re: été and café au lait !',
    );
  });

  it('should drop whitespace between adjacent encoded words only', () => {
    asserts.assertEquals(
      decodeEncodedWords('=?UTF-8?Q?one?=  =?UTF-8?Q?two?= three'),
      'onetwo three',
    );
  });

  it('should honour a language tag and an unknown charset', () => {
    asserts.assertEquals(decodeEncodedWords('=?UTF-8*en?Q?hi?='), 'hi');
    asserts.assertEquals(
      decodeEncodedWords('=?x-nonsense?Q?caf=E9?='),
      'café',
    );
  });

  it('should leave malformed words as written', () => {
    const malformed = '=?UTF-8?Q?unterminated and =?UTF-8?X?bad-encoding?=';
    asserts.assertEquals(decodeEncodedWords(malformed), malformed);
    asserts.assertEquals(decodeEncodedWords('plain'), 'plain');
  });
});
