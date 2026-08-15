import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { DriverError } from '../../errors/mod.ts';
import { saslPrep } from './saslprep.ts';

// NOTE: several inputs below carry intentional invisible characters as
// literals (SOFT HYPHEN U+00AD, BELL U+0007, NBSP U+00A0, IDEOGRAPHIC SPACE
// U+3000, NEL U+0085, PRIVATE-USE U+E000, full-width forms). Each is
// documented in a comment or the test title; do not "clean up" the strings.

describe('drivers.postgres.saslprep.saslPrep', () => {
  describe('regression — ASCII is untouched', () => {
    it('should leave a plain ASCII password unchanged', () => {
      asserts.assertStrictEquals(saslPrep('hunter2'), 'hunter2');
    });

    it('should preserve ASCII spaces, symbols and case', () => {
      asserts.assertStrictEquals(saslPrep('P@ss w0rd!-_'), 'P@ss w0rd!-_');
    });

    it('should leave an empty string empty', () => {
      asserts.assertStrictEquals(saslPrep(''), '');
    });
  });

  describe('RFC 4013 §3 examples', () => {
    it('#1 should map SOFT HYPHEN to nothing (I<U+00AD>X -> IX)', () => {
      asserts.assertStrictEquals(saslPrep('I­X'), 'IX');
    });

    it('#2 "user" is unchanged', () => {
      asserts.assertStrictEquals(saslPrep('user'), 'user');
    });

    it('#3 "USER" preserves case', () => {
      asserts.assertStrictEquals(saslPrep('USER'), 'USER');
    });

    it('#4 should NFKC-fold U+00AA to "a"', () => {
      asserts.assertStrictEquals(saslPrep('ª'), 'a');
    });

    it('#5 should NFKC-fold U+2168 (ROMAN NUMERAL NINE) to "IX"', () => {
      asserts.assertStrictEquals(saslPrep('Ⅸ'), 'IX');
    });

    it('#6 should reject U+0007 (prohibited control character)', () => {
      asserts.assertThrows(
        () => saslPrep(''),
        DriverError,
        'prohibited',
      );
    });

    it('#7 should reject a bidi violation (U+0627 U+0031)', () => {
      asserts.assertThrows(
        () => saslPrep('ا1'),
        DriverError,
        'bidirectional',
      );
    });
  });

  describe('space mapping (RFC 3454 C.1.2)', () => {
    it('should map a non-breaking space (U+00A0) to a regular space', () => {
      asserts.assertStrictEquals(saslPrep('a b'), 'a b');
    });

    it('should map an ideographic space (U+3000) to a regular space', () => {
      asserts.assertStrictEquals(saslPrep('a　b'), 'a b');
    });
  });

  describe('NFKC normalization of full-width forms', () => {
    it('should fold full-width digits to ASCII digits', () => {
      // U+FF11 U+FF12 U+FF13 -> "123"
      asserts.assertStrictEquals(saslPrep('１２３'), '123');
    });

    it('should fold full-width Latin letters to ASCII', () => {
      // "ＡＤＭＩＮ" (U+FF21 U+FF24 U+FF2D U+FF29 U+FF2E) -> "ADMIN"
      asserts.assertStrictEquals(
        saslPrep('ＡＤＭＩＮ'),
        'ADMIN',
      );
    });
  });

  describe('prohibited code points', () => {
    it('should reject a C1 control character (U+0085)', () => {
      asserts.assertThrows(
        () => saslPrep('password'),
        DriverError,
        'prohibited',
      );
    });

    it('should reject a private-use character (U+E000)', () => {
      asserts.assertThrows(
        () => saslPrep(''),
        DriverError,
        'prohibited',
      );
    });

    it('should report the offending code point in error context', () => {
      try {
        saslPrep('');
        throw new Error('expected saslPrep to throw');
      } catch (e) {
        asserts.assert(e instanceof DriverError);
        asserts.assertStrictEquals(
          (e.context as { codePoint?: number }).codePoint,
          0x0007,
        );
      }
    });
  });

  describe('bidirectional check (RFC 3454 §6)', () => {
    it('should accept an all-RTL string (Arabic)', () => {
      // U+0643 U+0644 U+0645 U+0629 ("كلمة") — all RandALCat, begins and
      // ends RTL, NFKC-stable.
      const rtl = 'كلمة';
      asserts.assertStrictEquals(saslPrep(rtl), rtl);
    });

    it('should reject an RTL string that ends with an ASCII letter', () => {
      asserts.assertThrows(
        () => saslPrep('كx'),
        DriverError,
        'bidirectional',
      );
    });
  });
});
