import * as asserts from '@std/asserts';
import { decodeHex } from '@std/encoding';
import { describe, it } from '@tundralibs/compat/test';
import { decodeCBOR, decodeCBORItem } from './decode.ts';
import { CBORError } from './errors/mod.ts';
import type { CBORValue } from './types/mod.ts';

/** Decode a hex string to bytes (test-vector convenience). */
const h = (hex: string): Uint8Array => decodeHex(hex);

describe('crypt.cbor decode — integers', () => {
  it('unsigned integers across every length encoding', () => {
    asserts.assertEquals(decodeCBOR(h('00')), 0);
    asserts.assertEquals(decodeCBOR(h('17')), 23); // inline max
    asserts.assertEquals(decodeCBOR(h('1818')), 24); // 1-byte
    asserts.assertEquals(decodeCBOR(h('1864')), 100);
    asserts.assertEquals(decodeCBOR(h('1903e8')), 1000); // 2-byte
    asserts.assertEquals(decodeCBOR(h('1a000f4240')), 1_000_000); // 4-byte
    asserts.assertEquals(decodeCBOR(h('1a7fffffff')), 0x7fffffff);
    asserts.assertEquals(decodeCBOR(h('1affffffff')), 0xffffffff); // > 2^31
  });

  it('an 8-byte integer stays a number when safe, else a bigint', () => {
    asserts.assertEquals(decodeCBOR(h('1b0000000000000064')), 100);
    asserts.assertEquals(
      decodeCBOR(h('1bffffffffffffffff')),
      18446744073709551615n, // 2^64 - 1, past the safe range → bigint
    );
  });

  it('negative integers (-1 - n)', () => {
    asserts.assertEquals(decodeCBOR(h('20')), -1);
    asserts.assertEquals(decodeCBOR(h('3863')), -100);
    asserts.assertEquals(decodeCBOR(h('3903e7')), -1000);
    // a bigint-scale negative
    asserts.assertEquals(
      decodeCBOR(h('3bffffffffffffffff')),
      -18446744073709551616n,
    );
  });
});

describe('crypt.cbor decode — strings, arrays, maps', () => {
  it('byte strings decode to an owned copy', () => {
    asserts.assertEquals(decodeCBOR(h('43010203')), new Uint8Array([1, 2, 3]));
    asserts.assertEquals(decodeCBOR(h('40')), new Uint8Array([])); // empty
  });

  it('text strings decode as UTF-8', () => {
    asserts.assertEquals(decodeCBOR(h('63616263')), 'abc');
    // "über" = text string, length 5 bytes: c3 bc 62 65 72
    asserts.assertEquals(decodeCBOR(h('65c3bc626572')), 'über');
    asserts.assertEquals(decodeCBOR(h('60')), ''); // empty string
  });

  it('arrays, including nesting', () => {
    asserts.assertEquals(decodeCBOR(h('83010203')), [1, 2, 3]);
    // [1, [2, 3]] — outer array(2): 82, then 01, then inner array(2) 82 02 03
    asserts.assertEquals(decodeCBOR(h('8201820203')), [1, [2, 3]]);
    asserts.assertEquals(decodeCBOR(h('80')), []); // empty
  });

  it('maps preserve integer and negative-integer keys (COSE labels)', () => {
    asserts.assertEquals(
      decodeCBOR(h('a201020304')),
      new Map<CBORValue, CBORValue>([[1, 2], [3, 4]]),
    );
    // {-1: 5} — a negative label like COSE uses
    asserts.assertEquals(
      decodeCBOR(h('a12005')),
      new Map<CBORValue, CBORValue>([[-1, 5]]),
    );
    // string-keyed map ({"fmt": "none"})
    asserts.assertEquals(
      decodeCBOR(h('a163666d74646e6f6e65')),
      new Map<CBORValue, CBORValue>([['fmt', 'none']]),
    );
  });
});

describe('crypt.cbor decode — simple values and floats', () => {
  it('false / true / null / undefined', () => {
    asserts.assertEquals(decodeCBOR(h('f4')), false);
    asserts.assertEquals(decodeCBOR(h('f5')), true);
    asserts.assertEquals(decodeCBOR(h('f6')), null);
    asserts.assertEquals(decodeCBOR(h('f7')), undefined);
  });

  it('half / single / double floats all decode to 1.5', () => {
    asserts.assertEquals(decodeCBOR(h('f93e00')), 1.5); // half
    asserts.assertEquals(decodeCBOR(h('fa3fc00000')), 1.5); // single
    asserts.assertEquals(decodeCBOR(h('fb3ff8000000000000')), 1.5); // double
  });
});

describe('crypt.cbor decode — errors', () => {
  it('rejects trailing bytes', () => {
    asserts.assertThrows(() => decodeCBOR(h('0000')), CBORError);
  });

  it('rejects a truncated argument', () => {
    asserts.assertThrows(() => decodeCBOR(h('18')), CBORError); // needs 1 more
    asserts.assertThrows(() => decodeCBOR(h('4302')), CBORError); // bstr short
  });

  it('rejects indefinite-length items (not CTAP2 canonical)', () => {
    const err = asserts.assertThrows(() => decodeCBOR(h('9f00ff')), CBORError);
    asserts.assertStringIncludes((err as Error).message, 'indefinite');
  });

  it('rejects CBOR tags and reserved additional-info', () => {
    asserts.assertThrows(() => decodeCBOR(h('c000')), CBORError); // tag 0
    asserts.assertThrows(() => decodeCBOR(h('1c')), CBORError); // reserved 28
  });
});

describe('crypt.cbor decodeCBORItem — embedded items', () => {
  it('decodes one item and reports the next offset', () => {
    const data = h('0102'); // two 1-byte items
    const first = decodeCBORItem(data, 0);
    asserts.assertEquals(first.value, 1);
    asserts.assertEquals(first.offset, 1);
    const second = decodeCBORItem(data, first.offset);
    asserts.assertEquals(second.value, 2);
    asserts.assertEquals(second.offset, 2);
  });

  it('a map followed by trailing bytes stops at the map end', () => {
    // {1: 2} (a20102 → wrong; map of 1 pair is a1 0102) then a stray 0xff
    const { value, offset } = decodeCBORItem(h('a10102ff'), 0);
    asserts.assertEquals(value, new Map<CBORValue, CBORValue>([[1, 2]]));
    asserts.assertEquals(offset, 3); // stopped before the trailing 0xff
  });
});
