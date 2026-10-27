/**
 * @fileoverview Tests for command formatting.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { MailError } from '../errors/mod.ts';
import {
  astring,
  encodeAuthPlain,
  formatDate,
  formatSearch,
  formatUidSet,
  mailboxArg,
  parseInternalDate,
} from './format.ts';

describe('format', () => {
  it('should pick atom, quoted or literal for a string', () => {
    asserts.assertEquals(astring('INBOX'), 'INBOX');
    asserts.assertEquals(astring('two words'), '"two words"');
    asserts.assertEquals(astring('say "hi" \\'), '"say \\"hi\\" \\\\"');
    asserts.assertEquals(astring(''), '""');
    asserts.assertEquals(astring('pässword'), {
      literal: new TextEncoder().encode('pässword'),
    });
    asserts.assertEquals(astring('a\r\nb'), {
      literal: new TextEncoder().encode('a\r\nb'),
    });
  });

  it('should encode mailbox names as quoted modified UTF-7', () => {
    asserts.assertEquals(mailboxArg('INBOX'), '"INBOX"');
    asserts.assertEquals(mailboxArg('Entwürfe'), '"Entw&APw-rfe"');
    asserts.assertEquals(mailboxArg('A&B'), '"A&-B"');
  });

  it('should collapse UID lists into ranges and validate raw sets', () => {
    asserts.assertEquals(formatUidSet(7), '7');
    asserts.assertEquals(formatUidSet([5, 1, 2, 3, 2, 9]), '1:3,5,9');
    asserts.assertEquals(formatUidSet('1:*'), '1:*');
    asserts.assertThrows(() => formatUidSet([]), MailError, 'Empty');
    asserts.assertThrows(() => formatUidSet([0]), MailError, 'positive');
    asserts.assertThrows(() => formatUidSet('1 OR 2'), MailError, 'Invalid');
  });

  it('should format dates as DD-Mon-YYYY in UTC', () => {
    asserts.assertEquals(
      formatDate(new Date('2026-03-05T23:30:00Z')),
      '5-Mar-2026',
    );
  });

  it('should build search keys', () => {
    asserts.assertEquals(formatSearch({}), ['ALL']);
    asserts.assertEquals(
      formatSearch({
        seen: false,
        deleted: true,
        since: new Date('2026-10-01T00:00:00Z'),
        uid: [3, 4],
        from: 'ada',
        raw: ' LARGER 10 ',
      }),
      [
        'UNSEEN',
        'DELETED',
        'SINCE',
        '1-Oct-2026',
        'UID',
        '3:4',
        'FROM',
        'ada',
        'LARGER 10',
      ],
    );
    asserts.assertEquals(formatSearch({ subject: 'größe' })[0], 'CHARSET');
  });

  it('should encode the PLAIN initial response', () => {
    asserts.assertEquals(encodeAuthPlain('u', 'p'), btoa('\0u\0p'));
    asserts.assertEquals(atob(encodeAuthPlain('ü', 'p')).length, 5);
  });

  it('should parse INTERNALDATE with its zone', () => {
    asserts.assertEquals(
      parseInternalDate('17-Jul-1996 02:44:25 -0700'),
      new Date('1996-07-17T09:44:25Z'),
    );
    asserts.assertEquals(
      parseInternalDate(' 5-Jan-2026 00:00:00 +0530'),
      new Date('2026-01-04T18:30:00Z'),
    );
    asserts.assertEquals(parseInternalDate('yesterday'), undefined);
  });
});
