/**
 * @fileoverview Tests for the base64 and quoted-printable decoders.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  decodeBase64,
  decodeQuotedPrintable,
  decodeTransfer,
} from './transferEncoding.ts';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const bytes = (s: string) => ENCODER.encode(s);

describe('transferEncoding', () => {
  describe('decodeBase64', () => {
    it('should decode across line breaks and without padding', () => {
      asserts.assertEquals(
        DECODER.decode(decodeBase64(bytes('aGVs\r\nbG8g\nd29y bGQ'))),
        'hello world',
      );
    });

    it('should stop at padding and skip stray characters', () => {
      asserts.assertEquals(
        DECODER.decode(decodeBase64(bytes('aGk=garbage'))),
        'hi',
      );
      asserts.assertEquals(decodeBase64(bytes('!!')), new Uint8Array(0));
    });

    it('should accept the URL-safe alphabet', () => {
      asserts.assertEquals(
        decodeBase64(bytes('-_8')),
        new Uint8Array([0xfb, 0xff]),
      );
    });
  });

  describe('decodeQuotedPrintable', () => {
    it('should decode escapes, soft breaks and trailing whitespace', () => {
      asserts.assertEquals(
        DECODER.decode(
          decodeQuotedPrintable(bytes('caf=C3=A9 =\r\nau lait  \r\nend')),
        ),
        'café au lait\r\nend',
      );
      asserts.assertEquals(
        DECODER.decode(decodeQuotedPrintable(bytes('soft=\nbreak'))),
        'softbreak',
      );
    });

    it('should keep an = that is not an escape', () => {
      asserts.assertEquals(
        DECODER.decode(decodeQuotedPrintable(bytes('a=b =ZZ ='))),
        'a=b =ZZ =',
      );
    });

    it('should map underscore to space in Q encoding only', () => {
      asserts.assertEquals(
        DECODER.decode(decodeQuotedPrintable(bytes('a_b'), true)),
        'a b',
      );
      asserts.assertEquals(
        DECODER.decode(decodeQuotedPrintable(bytes('a_b'))),
        'a_b',
      );
    });
  });

  describe('decodeTransfer', () => {
    it('should pass 7bit, 8bit, binary and unknown encodings through', () => {
      const input = bytes('as=is');
      for (const enc of ['7bit', '8bit', 'binary', 'x-uuencode']) {
        asserts.assertEquals(decodeTransfer(input, enc), input);
      }
      asserts.assertEquals(
        DECODER.decode(decodeTransfer(input, 'quoted-printable')),
        'as=is',
      );
      asserts.assertEquals(
        DECODER.decode(decodeTransfer(bytes('aGk='), 'base64')),
        'hi',
      );
    });
  });
});
