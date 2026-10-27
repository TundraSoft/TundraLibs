/**
 * @fileoverview Tests for address-list parsing.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { parseAddressList } from './addresses.ts';

describe('parseAddressList', () => {
  it('should parse the common forms', () => {
    asserts.assertEquals(
      parseAddressList(
        '"Doe, Jane" <jane@example.com>, bob@example.com, Ann <ann@example.com> (Sales)',
      ),
      [
        { name: 'Doe, Jane', address: 'jane@example.com' },
        { address: 'bob@example.com' },
        { name: 'Ann', address: 'ann@example.com' },
      ],
    );
  });

  it('should decode encoded-word display names', () => {
    asserts.assertEquals(
      parseAddressList('=?UTF-8?B?SsO8cmdlbg==?= <j@example.com>'),
      [{ name: 'Jürgen', address: 'j@example.com' }],
    );
  });

  it('should flatten groups and use a comment as the name of a bare address', () => {
    asserts.assertEquals(
      parseAddressList(
        'Team: a@example.com, b@example.com (Bee); c@example.com',
      ),
      [
        { address: 'a@example.com' },
        { name: 'Bee', address: 'b@example.com' },
        { address: 'c@example.com' },
      ],
    );
  });

  it('should keep unparseable text rather than dropping it', () => {
    asserts.assertEquals(parseAddressList('not an address'), [
      { address: 'not an address' },
    ]);
    asserts.assertEquals(parseAddressList(''), []);
    asserts.assertEquals(parseAddressList(undefined), []);
    asserts.assertEquals(parseAddressList(' , ,'), []);
  });
});
