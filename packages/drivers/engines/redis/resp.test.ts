/**
 * @fileoverview Tests for RESP3 encoder and parser.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { encodeCommand, parseReply, RespError, unwrap } from './resp.ts';

// =============================================================================
// Helpers
// =============================================================================

const enc = new TextEncoder();

function encode(s: string): Uint8Array {
  return enc.encode(s);
}

// =============================================================================
// Test Suites
// =============================================================================

describe('drivers.redis.resp', () => {
  describe('RespError', () => {
    it('should create with message and prefix', () => {
      const err = new RespError('ERR bad command', 'ERR');
      asserts.assertStrictEquals(err.message, 'ERR bad command');
      asserts.assertStrictEquals(err.prefix, 'ERR');
      asserts.assertStrictEquals(err.name, 'RespError');
      asserts.assert(err instanceof Error);
      asserts.assert(err instanceof RespError);
    });
  });

  describe('encodeCommand()', () => {
    it('should encode a simple command', () => {
      const buf = encodeCommand(['PING']);
      const str = new TextDecoder().decode(buf);
      asserts.assertStrictEquals(str, '*1\r\n$4\r\nPING\r\n');
    });

    it('should encode a command with string and number args', () => {
      const buf = encodeCommand(['SET', 'key', 42]);
      const str = new TextDecoder().decode(buf);
      asserts.assertStrictEquals(
        str,
        '*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$2\r\n42\r\n',
      );
    });

    it('should encode multi-part command', () => {
      const buf = encodeCommand(['HSET', 'myhash', 'field1', 'value1']);
      const str = new TextDecoder().decode(buf);
      asserts.assertStrictEquals(
        str,
        '*4\r\n$4\r\nHSET\r\n$6\r\nmyhash\r\n$6\r\nfield1\r\n$6\r\nvalue1\r\n',
      );
    });
  });

  describe('parseReply() - RESP2 types', () => {
    it('should parse simple string (+)', () => {
      const result = parseReply(encode('+OK\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'string');
      asserts.assertStrictEquals(
        (result.value as { kind: 'string'; value: string }).value,
        'OK',
      );
      asserts.assertStrictEquals(result.consumed, 5);
    });

    it('should parse simple error (-)', () => {
      const result = parseReply(encode('-ERR bad command\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'error');
    });

    it('should parse integer (:)', () => {
      const result = parseReply(encode(':42\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'integer');
      asserts.assertStrictEquals(
        (result.value as { kind: 'integer'; value: number }).value,
        42,
      );
    });

    it('should parse bulk string ($)', () => {
      const result = parseReply(encode('$5\r\nhello\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'bulk');
      asserts.assertStrictEquals(
        (result.value as { kind: 'bulk'; value: string | null }).value,
        'hello',
      );
    });

    it('should parse null bulk string ($-1)', () => {
      const result = parseReply(encode('$-1\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'bulk');
      asserts.assertStrictEquals(
        (result.value as { kind: 'bulk'; value: string | null }).value,
        null,
      );
    });

    it('should parse array (*)', () => {
      const result = parseReply(encode('*2\r\n+foo\r\n:1\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'array');
      const arr =
        (result.value as { kind: 'array'; value: unknown[] | null }).value;
      asserts.assert(Array.isArray(arr));
      asserts.assertStrictEquals(arr!.length, 2);
    });

    it('should parse null array (*-1)', () => {
      const result = parseReply(encode('*-1\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'array');
      asserts.assertStrictEquals(
        (result.value as { kind: 'array'; value: unknown[] | null }).value,
        null,
      );
    });

    it('should return null for incomplete data (no CRLF)', () => {
      const result = parseReply(encode('+PARTIAL'));
      asserts.assertStrictEquals(result, null);
    });

    it('should return null for empty buffer', () => {
      const result = parseReply(encode(''), 0);
      asserts.assertStrictEquals(result, null);
    });

    it('should return null for offset >= buffer.length', () => {
      const buf = encode('+OK\r\n');
      const result = parseReply(buf, buf.length);
      asserts.assertStrictEquals(result, null);
    });

    it('should throw for unknown RESP tag', () => {
      asserts.assertThrows(
        () => parseReply(encode('?unknown\r\n')),
        RespError,
        'Unknown RESP tag',
      );
    });
  });

  describe('parseReply() - RESP3 types', () => {
    it('should parse null (_)', () => {
      const result = parseReply(encode('_\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'null');
      asserts.assertStrictEquals(result.consumed, 3);
    });

    it('should parse boolean true (#)', () => {
      const result = parseReply(encode('#t\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'boolean');
      asserts.assertStrictEquals(
        (result.value as { kind: 'boolean'; value: boolean }).value,
        true,
      );
    });

    it('should parse boolean false (#)', () => {
      const result = parseReply(encode('#f\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'boolean');
      asserts.assertStrictEquals(
        (result.value as { kind: 'boolean'; value: boolean }).value,
        false,
      );
    });

    it('should parse double (,)', () => {
      const result = parseReply(encode(',3.14\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'double');
      asserts.assert(
        Math.abs(
          (result.value as { kind: 'double'; value: number }).value - 3.14,
        ) < 0.001,
      );
    });

    it('should parse big integer (()', () => {
      const result = parseReply(encode('(12345678901234567890\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'bigint');
      asserts.assertStrictEquals(
        (result.value as { kind: 'bigint'; value: bigint }).value,
        12345678901234567890n,
      );
    });

    it('should parse verbatim string (=)', () => {
      const result = parseReply(encode('=15\r\ntxt:Some string\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'verbatim');
    });

    it('should parse map (%)', () => {
      const result = parseReply(encode('%1\r\n+key\r\n:1\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'map');
    });

    it('should parse set (~)', () => {
      const result = parseReply(encode('~2\r\n+a\r\n+b\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'set');
    });

    it('should parse push (>)', () => {
      const result = parseReply(encode('>2\r\n+message\r\n+channel\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'push');
    });

    it('should parse bulk error (!)', () => {
      const result = parseReply(encode('!11\r\nERR foo bar\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'error');
    });

    it('should parse attribute (|) and return next value', () => {
      // Attribute frame: |1\r\n+key\r\n+val\r\n followed by the real value
      const result = parseReply(encode('|1\r\n+k\r\n+v\r\n+REAL\r\n'));
      asserts.assert(result !== null);
      // Attribute is consumed and the next frame (REAL) is returned
      asserts.assertStrictEquals(result.value.kind, 'string');
      asserts.assertStrictEquals(
        (result.value as { kind: 'string'; value: string }).value,
        'REAL',
      );
    });
  });

  describe('parseReply() - 64-bit integer precision', () => {
    it('should keep a value at the safe-integer boundary as a number', () => {
      // 2^53 - 1 = Number.MAX_SAFE_INTEGER — the last value a JS `number`
      // holds exactly.
      const result = parseReply(encode(':9007199254740991\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'integer');
      const v =
        (result.value as { kind: 'integer'; value: number | bigint }).value;
      asserts.assertStrictEquals(typeof v, 'number');
      asserts.assertStrictEquals(v, 9007199254740991);
    });

    it('should return 2^53 + 1 as an exact bigint (a number would round)', () => {
      // 9007199254740993 is not representable as a JS `number`
      // (it collapses to 9007199254740992), so it must come back as bigint.
      const result = parseReply(encode(':9007199254740993\r\n'));
      asserts.assert(result !== null);
      asserts.assertStrictEquals(result.value.kind, 'integer');
      const v =
        (result.value as { kind: 'integer'; value: number | bigint }).value;
      asserts.assertStrictEquals(typeof v, 'bigint');
      asserts.assertStrictEquals(v, 9007199254740993n);
    });

    it('should preserve i64 max without rounding', () => {
      const result = parseReply(encode(':9223372036854775807\r\n'));
      asserts.assert(result !== null);
      const v =
        (result.value as { kind: 'integer'; value: number | bigint }).value;
      asserts.assertStrictEquals(typeof v, 'bigint');
      asserts.assertStrictEquals(v, 9223372036854775807n);
    });

    it('should preserve i64 min (large negative) without rounding', () => {
      const result = parseReply(encode(':-9223372036854775808\r\n'));
      asserts.assert(result !== null);
      const v =
        (result.value as { kind: 'integer'; value: number | bigint }).value;
      asserts.assertStrictEquals(typeof v, 'bigint');
      asserts.assertStrictEquals(v, -9223372036854775808n);
    });

    it('should keep small positive integers as numbers', () => {
      const result = parseReply(encode(':42\r\n'));
      asserts.assert(result !== null);
      const v =
        (result.value as { kind: 'integer'; value: number | bigint }).value;
      asserts.assertStrictEquals(typeof v, 'number');
      asserts.assertStrictEquals(v, 42);
    });

    it('should keep small negative integers as numbers', () => {
      const result = parseReply(encode(':-7\r\n'));
      asserts.assert(result !== null);
      const v =
        (result.value as { kind: 'integer'; value: number | bigint }).value;
      asserts.assertStrictEquals(typeof v, 'number');
      asserts.assertStrictEquals(v, -7);
    });

    it('should throw RespError on a non-integer body', () => {
      asserts.assertThrows(
        () => parseReply(encode(':notanint\r\n')),
        RespError,
        'Malformed integer',
      );
    });

    it('should unwrap an out-of-range integer as bigint', () => {
      asserts.assertStrictEquals(
        unwrap({ kind: 'integer', value: 9007199254740993n }),
        9007199254740993n,
      );
    });
  });

  describe('parseReply() - incomplete frames (return null)', () => {
    it('should return null for incomplete bulk string (body not full)', () => {
      // $5\r\nhel - only 3 bytes of 5
      const result = parseReply(encode('$5\r\nhel'));
      asserts.assertStrictEquals(result, null);
    });

    it('should return null for incomplete array (missing elements)', () => {
      const result = parseReply(encode('*2\r\n+one\r\n'));
      asserts.assertStrictEquals(result, null);
    });

    it('should return null for incomplete integer', () => {
      const result = parseReply(encode(':'));
      asserts.assertStrictEquals(result, null);
    });
  });

  describe('unwrap()', () => {
    it('should unwrap string kind', () => {
      asserts.assertStrictEquals(
        unwrap({ kind: 'string', value: 'hello' }),
        'hello',
      );
    });

    it('should unwrap bulk kind', () => {
      asserts.assertStrictEquals(
        unwrap({ kind: 'bulk', value: 'world' }),
        'world',
      );
      asserts.assertStrictEquals(
        unwrap({ kind: 'bulk', value: null }),
        null,
      );
    });

    it('should unwrap integer kind', () => {
      asserts.assertStrictEquals(unwrap({ kind: 'integer', value: 99 }), 99);
    });

    it('should unwrap double kind', () => {
      asserts.assertStrictEquals(unwrap({ kind: 'double', value: 3.14 }), 3.14);
    });

    it('should unwrap bigint kind', () => {
      asserts.assertStrictEquals(unwrap({ kind: 'bigint', value: 42n }), 42n);
    });

    it('should unwrap boolean kind', () => {
      asserts.assertStrictEquals(
        unwrap({ kind: 'boolean', value: true }),
        true,
      );
    });

    it('should unwrap null kind', () => {
      asserts.assertStrictEquals(unwrap({ kind: 'null', value: null }), null);
    });

    it('should unwrap array kind recursively', () => {
      const result = unwrap({
        kind: 'array',
        value: [
          { kind: 'string', value: 'a' },
          { kind: 'integer', value: 1 },
        ],
      });
      asserts.assertEquals(result, ['a', 1]);
    });

    it('should unwrap null array', () => {
      asserts.assertStrictEquals(
        unwrap({ kind: 'array', value: null }),
        null,
      );
    });

    it('should unwrap set kind recursively', () => {
      const result = unwrap({
        kind: 'set',
        value: [{ kind: 'string', value: 'x' }],
      });
      asserts.assertEquals(result, ['x']);
    });

    it('should unwrap push kind recursively', () => {
      const result = unwrap({
        kind: 'push',
        value: [{ kind: 'string', value: 'msg' }],
      });
      asserts.assertEquals(result, ['msg']);
    });

    it('should unwrap map kind into object', () => {
      const result = unwrap({
        kind: 'map',
        value: [
          [{ kind: 'string', value: 'k' }, { kind: 'integer', value: 5 }],
        ],
      });
      asserts.assertEquals(result, { k: 5 });
    });

    it('should unwrap verbatim kind', () => {
      asserts.assertStrictEquals(
        unwrap({ kind: 'verbatim', value: 'hello', format: 'txt' }),
        'hello',
      );
    });

    it('should throw RespError for error kind', () => {
      const err = new RespError('ERR bad', 'ERR');
      asserts.assertThrows(
        () => unwrap({ kind: 'error', value: err }),
        RespError,
        'ERR bad',
      );
    });
  });
});
