/**
 * @fileoverview Tests for the charset fallback chain.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { decodeLatin1, decodeText, encodeLatin1 } from './charset.ts';

const UTF8_CAFE = new Uint8Array([0x63, 0x61, 0x66, 0xc3, 0xa9]);
const LATIN1_CAFE = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);

describe('charset', () => {
  it('should decode a declared charset', () => {
    asserts.assertEquals(decodeText(UTF8_CAFE, 'UTF-8'), 'café');
    asserts.assertEquals(decodeText(LATIN1_CAFE, 'iso-8859-1'), 'café');
  });

  it('should sniff UTF-8 then fall back to Latin-1 when the label is unknown or absent', () => {
    asserts.assertEquals(decodeText(UTF8_CAFE), 'café');
    asserts.assertEquals(decodeText(LATIN1_CAFE), 'café');
    asserts.assertEquals(decodeText(LATIN1_CAFE, 'x-no-such-charset'), 'café');
  });

  it('should not throw on invalid UTF-8 under a utf-8 label', () => {
    asserts.assertEquals(decodeText(LATIN1_CAFE, 'utf-8'), 'caf�');
  });

  it('should round-trip Latin-1', () => {
    asserts.assertEquals(decodeLatin1(LATIN1_CAFE), 'café');
    asserts.assertEquals(encodeLatin1('café'), LATIN1_CAFE);
  });
});
