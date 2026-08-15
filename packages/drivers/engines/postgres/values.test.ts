import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { decodeTextValue } from './values.ts';

// OID constants used below (pg_type.oid).
const BOOL = 16;
const INT8 = 20;
const INT2 = 21;
const INT4 = 23;
const FLOAT4 = 700;
const FLOAT8 = 701;
const BYTEA = 17;
const JSON_OID = 114;
const JSONB = 3802;
const DATE = 1082;
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;

describe('drivers.postgres.values.decodeTextValue', () => {
  it('passes SQL NULL straight through as null', () => {
    asserts.assertEquals(decodeTextValue(null, TIMESTAMPTZ), null);
    asserts.assertEquals(decodeTextValue(null, INT8), null);
  });

  it('decodes booleans (OID 16)', () => {
    asserts.assertEquals(decodeTextValue('t', BOOL), true);
    asserts.assertEquals(decodeTextValue('f', BOOL), false);
  });

  it('decodes int8 (OID 20) to bigint, preserving values past 2^53', () => {
    asserts.assertEquals(decodeTextValue('42', INT8), 42n);
    asserts.assertEquals(
      decodeTextValue('9223372036854775807', INT8),
      9223372036854775807n,
    );
    // Non-numeric text falls back to the raw string rather than throwing.
    asserts.assertEquals(decodeTextValue('not-a-number', INT8), 'not-a-number');
  });

  it('decodes int2/int4 (OID 21/23) to number', () => {
    asserts.assertEquals(decodeTextValue('7', INT2), 7);
    asserts.assertEquals(decodeTextValue('-100', INT4), -100);
  });

  it('decodes float4/float8 (OID 700/701) to number', () => {
    asserts.assertEquals(decodeTextValue('3.5', FLOAT4), 3.5);
    asserts.assertEquals(decodeTextValue('-0.25', FLOAT8), -0.25);
  });

  it('decodes bytea (OID 17) hex to Uint8Array', () => {
    asserts.assertEquals(
      decodeTextValue('\\xdeadbeef', BYTEA),
      new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    );
  });

  it('decodes json/jsonb (OID 114/3802), falling back on invalid JSON', () => {
    asserts.assertEquals(decodeTextValue('{"a":1}', JSONB), { a: 1 });
    asserts.assertEquals(decodeTextValue('[1,2,3]', JSON_OID), [1, 2, 3]);
    asserts.assertEquals(decodeTextValue('not json', JSONB), 'not json');
  });

  it('passes unknown OIDs through as the raw text', () => {
    asserts.assertEquals(decodeTextValue('hello', 25 /* text */), 'hello');
  });

  describe('timestamp / timestamptz (OID 1114/1184) date parsing', () => {
    // Postgres renders whole-hour tz offsets WITHOUT minutes (`+00`, `+05`,
    // `-08`), which `new Date()` rejects — these must still decode to a valid
    // Date. Regression for the timestamptz `+HH` Invalid-Date bug.
    const cases: Array<[string, string]> = [
      ['2024-01-01 12:00:00+00', '2024-01-01T12:00:00.000Z'], // UTC, bare +00
      ['2024-01-01 12:00:00+05', '2024-01-01T07:00:00.000Z'], // bare +05
      ['2024-01-01 12:00:00-08', '2024-01-01T20:00:00.000Z'], // bare -08
      ['2024-01-01 12:00:00+00:00', '2024-01-01T12:00:00.000Z'], // +HH:MM
      ['2024-01-01 12:00:00+05:30', '2024-01-01T06:30:00.000Z'], // half-hour
      ['2024-06-15 23:30:00-05:30', '2024-06-16T05:00:00.000Z'], // wraps day
      ['2024-01-01 12:00:00.123456+00', '2024-01-01T12:00:00.123Z'], // micros
      ['2024-01-01 12:00:00', '2024-01-01T12:00:00.000Z'], // naive → UTC
    ];
    for (const [input, expectedIso] of cases) {
      it(`decodes "${input}" to a valid Date`, () => {
        const d = decodeTextValue(input, TIMESTAMPTZ) as Date;
        asserts.assert(d instanceof Date, 'expected a Date');
        asserts.assert(
          !Number.isNaN(d.getTime()),
          `expected a valid Date for "${input}", got Invalid Date`,
        );
        asserts.assertEquals(d.toISOString(), expectedIso);
      });
    }

    it('decodes a naive TIMESTAMP (OID 1114) as UTC', () => {
      const d = decodeTextValue('2024-01-01 12:00:00', TIMESTAMP) as Date;
      asserts.assertEquals(d.toISOString(), '2024-01-01T12:00:00.000Z');
    });

    it('decodes a bare DATE (OID 1082) as UTC midnight', () => {
      const d = decodeTextValue('2024-01-01', DATE) as Date;
      asserts.assertEquals(d.toISOString(), '2024-01-01T00:00:00.000Z');
    });
  });

  // Regression: boundary renderings that the old `_parseDate` mishandled — the
  // `infinity` sentinels and BC/whole-second-offset shapes produced Invalid
  // Date, and a 5-digit year silently decoded to the wrong (9999) instant.
  describe('date boundary parsing (regression)', () => {
    it('maps infinity / -infinity to a valid (max/min) Date', () => {
      const pos = decodeTextValue('infinity', TIMESTAMPTZ) as Date;
      asserts.assert(pos instanceof Date && !Number.isNaN(pos.getTime()));
      asserts.assertEquals(pos.getTime(), 8.64e15);

      const neg = decodeTextValue('-infinity', TIMESTAMPTZ) as Date;
      asserts.assert(neg instanceof Date && !Number.isNaN(neg.getTime()));
      asserts.assertEquals(neg.getTime(), -8.64e15);
    });

    it('decodes a BC date to a valid (astronomical-year) Date', () => {
      const d = decodeTextValue('0044-03-15 BC', DATE) as Date;
      asserts.assert(d instanceof Date, 'expected a Date');
      asserts.assert(
        !Number.isNaN(d.getTime()),
        'expected a valid Date for a BC year, got Invalid Date',
      );
      // 44 BC → astronomical year -(44 - 1) = -43.
      asserts.assertEquals(d.getUTCFullYear(), -43);
    });

    it('decodes a whole-second tz offset (+HH:MM:SS) to the right instant', () => {
      const d = decodeTextValue(
        '2024-06-01 12:00:00+05:30:15',
        TIMESTAMPTZ,
      ) as Date;
      asserts.assert(
        !Number.isNaN(d.getTime()),
        'expected a valid Date for a whole-second offset',
      );
      // 12:00:00 at +05:30:15 → UTC 06:29:45.
      asserts.assertEquals(d.toISOString(), '2024-06-01T06:29:45.000Z');
    });

    it('decodes a year > 9999 to the correct (not truncated) year', () => {
      const d = decodeTextValue('10000-01-01', DATE) as Date;
      asserts.assert(!Number.isNaN(d.getTime()), 'expected a valid Date');
      asserts.assertEquals(d.getUTCFullYear(), 10000);
      asserts.assertEquals(d.getUTCMonth(), 0);
      asserts.assertEquals(d.getUTCDate(), 1);
    });
  });
});
