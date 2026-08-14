import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { encodeParam, OID } from './binary.ts';
import { EngineError } from '../../errors/mod.ts';

const dec = new TextDecoder();

/** Read an encoded param's body as a big-endian signed 32-bit integer. */
function readInt32BE(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getInt32(0, false);
}

/** Read an encoded param's body as a big-endian signed 64-bit integer. */
function readBigInt64BE(bytes: Uint8Array): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getBigInt64(0, false);
}

/** Read an encoded param's body as a big-endian IEEE-754 double. */
function readFloat64BE(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getFloat64(0, false);
}

const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;

describe('drivers.postgres.binary.encodeParam', () => {
  describe('integer numbers', () => {
    it('should encode an int4-range integer as int4', () => {
      const encoded = encodeParam(42);
      asserts.assertEquals(encoded.oid, OID.INT4);
      asserts.assertEquals(encoded.format, 1);
      asserts.assertEquals(encoded.bytes?.length, 4);
      asserts.assertEquals(readInt32BE(encoded.bytes!), 42);
    });

    it('should encode the int4 boundaries as int4', () => {
      for (const value of [INT4_MIN, INT4_MAX, 0, -1]) {
        const encoded = encodeParam(value);
        asserts.assertEquals(
          encoded.oid,
          OID.INT4,
          `${value} should encode as int4`,
        );
        asserts.assertEquals(encoded.bytes?.length, 4);
        asserts.assertEquals(readInt32BE(encoded.bytes!), value);
      }
    });

    // Regression: integers past the int4 range used to fall through to the
    // float8 branch, mistyping the parameter — the server then compared a
    // bigint column against a double.
    it('should encode an integer past int4 as int8, not float8', () => {
      const value = INT4_MAX + 1;
      const encoded = encodeParam(value);
      asserts.assertEquals(encoded.oid, OID.INT8);
      asserts.assertEquals(encoded.format, 1);
      asserts.assertEquals(encoded.bytes?.length, 8);
      asserts.assertEquals(readBigInt64BE(encoded.bytes!), BigInt(value));
    });

    it('should encode an integer below int4 as int8, not float8', () => {
      const value = INT4_MIN - 1;
      const encoded = encodeParam(value);
      asserts.assertEquals(encoded.oid, OID.INT8);
      asserts.assertEquals(encoded.bytes?.length, 8);
      asserts.assertEquals(readBigInt64BE(encoded.bytes!), BigInt(value));
    });

    it('should encode a large safe integer as int8', () => {
      const value = Number.MAX_SAFE_INTEGER; // 2^53 - 1
      const encoded = encodeParam(value);
      asserts.assertEquals(encoded.oid, OID.INT8);
      asserts.assertEquals(readBigInt64BE(encoded.bytes!), BigInt(value));
    });

    it('should fall back to float8 for integers larger than int8', () => {
      // 1e30 is an integer-valued double but has no Postgres integer type
      // that can hold it, so float8 is the only option left.
      const encoded = encodeParam(1e30);
      asserts.assertEquals(encoded.oid, OID.FLOAT8);
      asserts.assertEquals(encoded.bytes?.length, 8);
      asserts.assertEquals(readFloat64BE(encoded.bytes!), 1e30);
    });
  });

  describe('non-integer numbers', () => {
    it('should encode a fractional number as float8', () => {
      const encoded = encodeParam(1.5);
      asserts.assertEquals(encoded.oid, OID.FLOAT8);
      asserts.assertEquals(encoded.format, 1);
      asserts.assertEquals(encoded.bytes?.length, 8);
      asserts.assertEquals(readFloat64BE(encoded.bytes!), 1.5);
    });

    it('should encode a small negative fraction as float8', () => {
      const encoded = encodeParam(-0.25);
      asserts.assertEquals(encoded.oid, OID.FLOAT8);
      asserts.assertEquals(readFloat64BE(encoded.bytes!), -0.25);
    });

    // `Number.isInteger` rejects these, which also keeps them away from the
    // `BigInt()` conversion on the integer path (it throws on both).
    it('should encode NaN and infinities as float8', () => {
      const nan = encodeParam(Number.NaN);
      asserts.assertEquals(nan.oid, OID.FLOAT8);
      asserts.assert(Number.isNaN(readFloat64BE(nan.bytes!)));

      for (const value of [Number.POSITIVE_INFINITY, -Infinity]) {
        const encoded = encodeParam(value);
        asserts.assertEquals(encoded.oid, OID.FLOAT8);
        asserts.assertEquals(readFloat64BE(encoded.bytes!), value);
      }
    });
  });

  describe('neighbouring types (unchanged)', () => {
    it('should still encode bigint as int8', () => {
      const encoded = encodeParam(9_007_199_254_740_993n);
      asserts.assertEquals(encoded.oid, OID.INT8);
      asserts.assertEquals(encoded.format, 1);
      asserts.assertEquals(
        readBigInt64BE(encoded.bytes!),
        9_007_199_254_740_993n,
      );
    });

    it('should still encode booleans as bool', () => {
      asserts.assertEquals(encodeParam(true).oid, OID.BOOL);
      asserts.assertEquals(encodeParam(true).bytes, new Uint8Array([1]));
      asserts.assertEquals(encodeParam(false).bytes, new Uint8Array([0]));
    });

    it('should still send strings untyped in text format', () => {
      const encoded = encodeParam('42');
      asserts.assertEquals(encoded.oid, 0);
      asserts.assertEquals(encoded.format, 0);
    });

    it('should still encode null and undefined as SQL NULL', () => {
      asserts.assertEquals(encodeParam(null).bytes, null);
      asserts.assertEquals(encodeParam(undefined).bytes, null);
    });
  });

  describe('bigint boundaries (regression)', () => {
    // In-range bigints keep the binary int8 encoding.
    it('should encode in-range bigints as int8 (binary)', () => {
      const cases: Array<[bigint, bigint]> = [
        [42n, 42n],
        [-5n, -5n],
        [9_223_372_036_854_775_807n, 9_223_372_036_854_775_807n], // INT8_MAX
        [-9_223_372_036_854_775_808n, -9_223_372_036_854_775_808n], // INT8_MIN
      ];
      for (const [value, expected] of cases) {
        const encoded = encodeParam(value);
        asserts.assertEquals(encoded.oid, OID.INT8, `${value} should be int8`);
        asserts.assertEquals(encoded.format, 1);
        asserts.assertEquals(encoded.bytes?.length, 8);
        asserts.assertEquals(readBigInt64BE(encoded.bytes!), expected);
      }
    });

    // Regression: bigints past the signed-64-bit window used to reach
    // `setBigInt64` unchecked and two's-complement-WRAP — 2^63 was sent as
    // -2^63, 2^64 as 0, 10^30 as garbage. They must now go out as the exact
    // decimal in untyped TEXT so the server coerces to `numeric` losslessly.
    it('should encode out-of-range bigints as exact-decimal text', () => {
      const cases: Array<[bigint, string]> = [
        [9_223_372_036_854_775_808n, '9223372036854775808'], // 2^63 (INT8_MAX+1)
        [10n ** 30n, '1000000000000000000000000000000'],
        [2n ** 64n, '18446744073709551616'],
        [-9_223_372_036_854_775_809n, '-9223372036854775809'], // INT8_MIN-1
      ];
      for (const [value, expected] of cases) {
        const encoded = encodeParam(value);
        asserts.assertEquals(encoded.oid, 0, `${value} should be unspecified`);
        asserts.assertEquals(encoded.format, 0, `${value} should be text`);
        asserts.assertEquals(dec.decode(encoded.bytes!), expected);
      }
    });
  });

  describe('Date parameter (regression)', () => {
    it('should still encode a valid Date as timestamptz (binary)', () => {
      const encoded = encodeParam(new Date('2024-01-01T00:00:00.000Z'));
      asserts.assertEquals(encoded.oid, OID.TIMESTAMPTZ);
      asserts.assertEquals(encoded.format, 1);
      asserts.assertEquals(encoded.bytes?.length, 8);
    });

    // Regression: an Invalid Date reached `BigInt(NaN)` and threw a raw
    // `RangeError`; it must now throw a typed `EngineError` instead.
    it('should throw EngineError (not RangeError) for an Invalid Date', () => {
      const err = asserts.assertThrows(
        () => encodeParam(new Date('not-a-date')),
        EngineError,
      );
      asserts.assert(
        !(err instanceof RangeError),
        'should not surface a raw RangeError',
      );
    });
  });
});
