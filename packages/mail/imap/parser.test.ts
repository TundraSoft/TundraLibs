/**
 * @fileoverview Tests for the response tokenizer.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { ImapParseError } from '../errors/mod.ts';
import { tokenize, tokenList, tokenNumber, tokenText } from './parser.ts';

const BYTES = new TextEncoder().encode('raw bytes');

describe('tokenize', () => {
  it('should read atoms, quoted strings, NIL and nested lists', () => {
    asserts.assertEquals(
      tokenize(['LIST (\\HasNoChildren \\Trash) "/" "Dele\\"ted" NIL (a (b))']),
      [
        { kind: 'atom', value: 'LIST' },
        {
          kind: 'list',
          items: [
            { kind: 'atom', value: '\\HasNoChildren' },
            { kind: 'atom', value: '\\Trash' },
          ],
        },
        { kind: 'string', value: '/' },
        { kind: 'string', value: 'Dele"ted' },
        { kind: 'nil' },
        {
          kind: 'list',
          items: [
            { kind: 'atom', value: 'a' },
            { kind: 'list', items: [{ kind: 'atom', value: 'b' }] },
          ],
        },
      ],
    );
  });

  it('should splice literals into their position and keep sections', () => {
    const tokens = tokenize([
      '3 FETCH (UID 7 BODY[HEADER] ',
      { literal: BYTES, size: 9, truncated: false },
      ' FLAGS (\\Seen))',
    ]);
    const list = tokenList(tokens[2]);
    asserts.assertEquals(tokenText(list[2]), 'BODY');
    asserts.assertEquals(list[3], {
      kind: 'section',
      items: [{ kind: 'atom', value: 'HEADER' }],
    });
    asserts.assertEquals(list[4], {
      kind: 'literal',
      value: BYTES,
      size: 9,
      truncated: false,
    });
    asserts.assertEquals(tokenText(list[4]), 'raw bytes');
    asserts.assertEquals(tokenNumber(tokens[0]), 3);
    asserts.assertEquals(tokenNumber(list[1]), 7);
  });

  it('should treat NIL case-insensitively and numbers as atoms', () => {
    asserts.assertEquals(tokenize(['nil 42']), [
      { kind: 'nil' },
      { kind: 'atom', value: '42' },
    ]);
    asserts.assertEquals(tokenNumber({ kind: 'atom', value: 'x' }), undefined);
    asserts.assertEquals(tokenNumber({ kind: 'atom', value: '-1' }), undefined);
    asserts.assertEquals(tokenText({ kind: 'nil' }), undefined);
    asserts.assertEquals(tokenList({ kind: 'nil' }), []);
  });

  it('should throw ImapParseError on unbalanced input', () => {
    for (const bad of ['(a', 'a)', '"open', 'BODY[x']) {
      const err = asserts.assertThrows(() => tokenize([bad]), ImapParseError);
      asserts.assertEquals(err.context.line, bad);
    }
  });
});
