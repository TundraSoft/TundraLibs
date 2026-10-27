/**
 * @fileoverview Tests for header parsing helpers.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  getHeader,
  getHeaders,
  parseContentType,
  parseMessageIds,
  parseParameterized,
  parseRawHeaders,
  stripComments,
} from './headers.ts';

const ENCODER = new TextEncoder();

describe('headers', () => {
  describe('parseRawHeaders', () => {
    it('should unfold continuation lines and keep header order', () => {
      const headers = parseRawHeaders(ENCODER.encode(
        'Subject: a long\r\n\tfolded subject\r\nX-One: 1\r\nX-One: 2\r\n',
      ));
      asserts.assertEquals(headers, [
        { name: 'Subject', value: 'a long folded subject' },
        { name: 'X-One', value: '1' },
        { name: 'X-One', value: '2' },
      ]);
      asserts.assertEquals(getHeader(headers, 'x-one'), '1');
      asserts.assertEquals(getHeaders(headers, 'X-ONE'), ['1', '2']);
      asserts.assertEquals(getHeader(headers, 'missing'), undefined);
    });

    it('should fall back to Latin-1 when the block is not UTF-8', () => {
      const headers = parseRawHeaders(
        new Uint8Array([0x58, 0x3a, 0x20, 0xe9, 0x0a]), // "X: é\n" in Latin-1
      );
      asserts.assertEquals(headers, [{ name: 'X', value: 'é' }]);
    });
  });

  describe('parseParameterized', () => {
    it('should join RFC 2231 continuations and decode the charset', () => {
      const { value, params } = parseParameterized(
        "attachment; filename*0*=utf-8''%E2%82%AC; filename*1*=%20rates; filename*2=.csv",
      );
      asserts.assertEquals(value, 'attachment');
      asserts.assertEquals(params, { filename: '€ rates.csv' });
    });

    it('should unquote values, lowercase keys and decode encoded words', () => {
      const { params } = parseParameterized(
        'text/plain; CharSet="ISO-8859-1"; name="=?UTF-8?Q?caf=C3=A9.txt?="; empty=',
      );
      asserts.assertEquals(params, {
        charset: 'ISO-8859-1',
        name: 'café.txt',
        empty: '',
      });
    });

    it('should ignore comments and a parameter with no equals sign', () => {
      const { value, params } = parseParameterized(
        'multipart/mixed (legacy); boundary="a;b"; junk',
      );
      asserts.assertEquals(value, 'multipart/mixed');
      asserts.assertEquals(params, { boundary: 'a;b' });
    });
  });

  describe('parseContentType', () => {
    it('should default to text/plain when absent or malformed', () => {
      asserts.assertEquals(parseContentType(undefined), {
        type: 'text',
        subtype: 'plain',
        params: {},
      });
      asserts.assertEquals(
        parseContentType('garbage; charset=x').subtype,
        'plain',
      );
      asserts.assertEquals(parseContentType('Image/PNG'), {
        type: 'image',
        subtype: 'png',
        params: {},
      });
    });
  });

  describe('parseMessageIds', () => {
    it('should take bracketed ids in order and bare ids as a fallback', () => {
      asserts.assertEquals(
        parseMessageIds('<a@x> (comment) <b@y>'),
        ['a@x', 'b@y'],
      );
      asserts.assertEquals(parseMessageIds('bare@id other@id'), [
        'bare@id',
        'other@id',
      ]);
      asserts.assertEquals(parseMessageIds(undefined), []);
      asserts.assertEquals(parseMessageIds('   '), []);
    });
  });

  describe('stripComments', () => {
    it('should remove nested comments but not parentheses inside quotes', () => {
      asserts.assertEquals(
        stripComments('a (one (two)) "(keep)" b'),
        'a  "(keep)" b',
      );
    });
  });
});
