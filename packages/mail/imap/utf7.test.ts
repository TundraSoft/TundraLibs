/**
 * @fileoverview Tests for modified UTF-7 mailbox names.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { decodeUtf7, encodeUtf7 } from './utf7.ts';

describe('utf7', () => {
  const cases: [string, string][] = [
    ['INBOX', 'INBOX'],
    ['A&B', 'A&-B'],
    ['Entwürfe', 'Entw&APw-rfe'],
    ['日本語', '&ZeVnLIqe-'],
    ['~peter/mail/台北/日本語', '~peter/mail/&U,BTFw-/&ZeVnLIqe-'],
    ['😀', '&2D3eAA-'],
  ];
  for (const [plain, wire] of cases) {
    it(`should round-trip ${plain}`, () => {
      asserts.assertEquals(encodeUtf7(plain), wire);
      asserts.assertEquals(decodeUtf7(wire), plain);
    });
  }

  it('should leave a malformed run as written', () => {
    asserts.assertEquals(decodeUtf7('&*bad-x'), '&*bad-x');
  });
});
