/**
 * @fileoverview RESP3 (REdis Serialization Protocol v3) encoder and parser.
 *
 * RESP3 is a strict superset of RESP2: every RESP2 frame is a valid RESP3
 * frame, and RESP3 adds richer types (maps, sets, doubles, big numbers,
 * server-push). The parser handles both — when the server is RESP2-only
 * (Redis < 6 / `HELLO` rejected), we just never see the new tags.
 *
 * The parser operates on raw `Uint8Array` byte buffers — Redis bulk strings
 * are byte-length-prefixed and can contain arbitrary binary, including UTF-8
 * data where the byte count differs from the JS string character count.
 *
 * Wire format:
 *
 * | Tag | Type            | Example                          |
 * |-----|-----------------|----------------------------------|
 * | `+` | Simple string   | `+OK\r\n`                        |
 * | `-` | Simple error    | `-ERR bad command\r\n`           |
 * | `:` | Integer         | `:1234\r\n`                      |
 * | `$` | Bulk string     | `$5\r\nhello\r\n` / `$-1\r\n`    |
 * | `*` | Array           | `*2\r\n+a\r\n+b\r\n`             |
 * | `_` | Null (RESP3)    | `_\r\n`                          |
 * | `#` | Boolean (RESP3) | `#t\r\n` / `#f\r\n`              |
 * | `,` | Double (RESP3)  | `,3.14\r\n`                      |
 * | `(` | Big number (RESP3) | `(31415926...\r\n`            |
 * | `=` | Verbatim (RESP3)| `=15\r\ntxt:Some string\r\n`     |
 * | `!` | Bulk error (RESP3) | `!10\r\nERR foo bar\r\n`      |
 * | `%` | Map (RESP3)     | `%1\r\n+a\r\n:1\r\n`             |
 * | `~` | Set (RESP3)     | `~2\r\n+a\r\n+b\r\n`             |
 * | `>` | Push (RESP3)    | `>2\r\n$7\r\nmessage\r\n+ch\r\n` |
 * | `\|` | Attribute (RESP3) | (consumed silently)            |
 *
 * The encoder always emits commands as a `*` array of `$` bulk strings —
 * that is the only form Redis accepts on the request side, regardless of
 * RESP2 vs RESP3.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';

const CR = 0x0d;
const LF = 0x0a;

/** A successfully-parsed RESP frame. `kind` lets callers branch without `instanceof`. */
export type RespValue =
  | { kind: 'string'; value: string }
  | { kind: 'error'; value: RespError }
  // RESP `:`-integers are 64-bit on the wire. Values within the JS
  // safe-integer range come back as `number` (the common case — small
  // counters, TTLs); values beyond ±(2^53−1) come back as `bigint` so a
  // large `INCR`/`BITCOUNT`/`MEMORY USAGE` result is never silently
  // rounded. See `_parseInteger`.
  | { kind: 'integer'; value: number | bigint }
  | { kind: 'bigint'; value: bigint }
  | { kind: 'double'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null'; value: null }
  | { kind: 'bulk'; value: string | null }
  | { kind: 'verbatim'; value: string; format: string }
  | { kind: 'array'; value: RespValue[] | null }
  | { kind: 'set'; value: RespValue[] }
  | { kind: 'map'; value: Array<[RespValue, RespValue]> }
  | { kind: 'push'; value: RespValue[] };

/** Server-side error frame. Distinct class so callers can `instanceof` it. */
export class RespError extends DriverError<{ prefix: string }> {
  public readonly prefix: string;
  /**
   * @param message - The full error string from the server (e.g. `"ERR wrong number of arguments"`).
   * @param prefix - The first whitespace-separated token (e.g. `"ERR"`, `"WRONGTYPE"`).
   */
  constructor(message: string, prefix: string) {
    super(message, { prefix });
    this.name = 'RespError';
    this.prefix = prefix;
  }
}

/**
 * Encode a Redis command as a RESP `*N` array of `$len` bulk strings.
 *
 * @param parts - Command tokens (string or number; numbers are toString'd).
 * @returns The fully serialized frame ready to write to the socket.
 *
 * @example
 * ```ts
 * encodeCommand(['SET', 'k', 'v']);
 * // *3\r\n$3\r\nSET\r\n$1\r\nk\r\n$1\r\nv\r\n
 * ```
 */
export function encodeCommand(
  parts: ReadonlyArray<string | number>,
): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [enc.encode(`*${parts.length}\r\n`)];
  for (const p of parts) {
    const s = typeof p === 'string' ? p : String(p);
    const bytes = enc.encode(s);
    chunks.push(enc.encode(`$${bytes.length}\r\n`));
    chunks.push(bytes);
    chunks.push(enc.encode('\r\n'));
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Result of a parse attempt against a partial buffer.
 *
 * - `value` is the decoded frame.
 * - `consumed` is the byte count to drop from the buffer.
 * - `null` return means the buffer doesn't yet hold a complete frame; the
 *   caller should read more bytes and retry.
 */
export type ParseResult = { value: RespValue; consumed: number } | null;

/**
 * Try to parse one RESP frame starting at `offset` in `buffer`.
 *
 * @param buffer - Byte buffer that may contain zero or more RESP frames.
 * @param offset - Byte offset to start parsing at. Defaults to 0.
 * @returns A `ParseResult`, or `null` if more data is needed.
 *
 * @throws {RespError} If the frame is malformed (unknown tag, bad length).
 */
export function parseReply(
  buffer: Uint8Array,
  offset: number = 0,
): ParseResult {
  if (offset >= buffer.length) return null;
  const tag = buffer[offset];
  switch (tag) {
    case 0x2b: // '+'
      return _parseSimpleString(buffer, offset);
    case 0x2d: // '-'
      return _parseError(buffer, offset);
    case 0x3a: // ':'
      return _parseInteger(buffer, offset);
    case 0x24: // '$'
      return _parseBulk(buffer, offset, false);
    case 0x3d: // '='
      return _parseBulk(buffer, offset, true);
    case 0x2a: // '*'
      return _parseAggregate(buffer, offset, 'array');
    case 0x25: // '%'
      return _parseAggregate(buffer, offset, 'map');
    case 0x7e: // '~'
      return _parseAggregate(buffer, offset, 'set');
    case 0x3e: // '>'
      return _parseAggregate(buffer, offset, 'push');
    case 0x5f: // '_'
      return _parseNull(buffer, offset);
    case 0x23: // '#'
      return _parseBoolean(buffer, offset);
    case 0x2c: // ','
      return _parseDouble(buffer, offset);
    case 0x28: // '('
      return _parseBigInt(buffer, offset);
    case 0x21: // '!'
      return _parseBulkError(buffer, offset);
    case 0x7c: // '|'
      return _parseAttribute(buffer, offset);
    default:
      throw new RespError(
        `Unknown RESP tag 0x${tag?.toString(16)} at offset ${offset}`,
        'PROTOCOL',
      );
  }
}

//#region Frame parsers

const decoder = new TextDecoder();

/** Locate `\r\n` starting at `from`; return absolute offset of `\r`, or -1. */
function _findCrlf(buffer: Uint8Array, from: number): number {
  for (let i = from; i + 1 < buffer.length; i++) {
    if (buffer[i] === CR && buffer[i + 1] === LF) return i;
  }
  return -1;
}

/** Decode bytes between `start` (inclusive) and `end` (exclusive) as UTF-8. */
function _decode(buffer: Uint8Array, start: number, end: number): string {
  return decoder.decode(buffer.subarray(start, end));
}

function _parseSimpleString(buffer: Uint8Array, offset: number): ParseResult {
  const end = _findCrlf(buffer, offset + 1);
  if (end < 0) return null;
  return {
    value: { kind: 'string', value: _decode(buffer, offset + 1, end) },
    consumed: end + 2 - offset,
  };
}

function _parseError(buffer: Uint8Array, offset: number): ParseResult {
  const end = _findCrlf(buffer, offset + 1);
  if (end < 0) return null;
  const message = _decode(buffer, offset + 1, end);
  const prefix = message.split(' ', 1)[0] ?? 'ERR';
  return {
    value: { kind: 'error', value: new RespError(message, prefix) },
    consumed: end + 2 - offset,
  };
}

/** Upper/lower bound a JS `number` represents without precision loss. */
const MAX_SAFE_INT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INT = BigInt(Number.MIN_SAFE_INTEGER);
/** A RESP `:`-integer body: an optional sign followed by decimal digits. */
const RESP_INTEGER_PATTERN = /^[+-]?\d+$/;

/**
 * Parse a RESP `:`-integer. The wire value is a signed 64-bit integer, so
 * `Number.parseInt` would silently round anything past ±(2^53−1). We parse
 * via `BigInt` for full fidelity and narrow back to `number` when the value
 * fits the JS safe-integer range, keeping the common case (`INCR` → 1)
 * ergonomic while never corrupting a genuinely-large counter.
 */
function _parseInteger(buffer: Uint8Array, offset: number): ParseResult {
  const end = _findCrlf(buffer, offset + 1);
  if (end < 0) return null;
  const raw = _decode(buffer, offset + 1, end);
  // Guard before `BigInt()` — it throws on junk and, worse, coerces `''`→0n
  // and accepts `0x…`; the strict pattern keeps the old NaN-on-garbage
  // contract and rejects both.
  if (!RESP_INTEGER_PATTERN.test(raw)) {
    throw new RespError(
      `Malformed integer at offset ${offset}`,
      'PROTOCOL',
    );
  }
  const big = BigInt(raw);
  const value = big >= MIN_SAFE_INT && big <= MAX_SAFE_INT ? Number(big) : big;
  return {
    value: { kind: 'integer', value },
    consumed: end + 2 - offset,
  };
}

function _parseBulk(
  buffer: Uint8Array,
  offset: number,
  verbatim: boolean,
): ParseResult {
  const lenEnd = _findCrlf(buffer, offset + 1);
  if (lenEnd < 0) return null;
  const len = Number.parseInt(_decode(buffer, offset + 1, lenEnd), 10);
  if (Number.isNaN(len)) {
    throw new RespError(
      `Malformed bulk length at offset ${offset}`,
      'PROTOCOL',
    );
  }
  // RESP2 nil bulk: $-1\r\n
  if (len < 0) {
    return {
      value: verbatim
        ? { kind: 'verbatim', value: '', format: '' }
        : { kind: 'bulk', value: null },
      consumed: lenEnd + 2 - offset,
    };
  }
  const dataStart = lenEnd + 2;
  const dataEnd = dataStart + len;
  if (dataEnd + 2 > buffer.length) return null;
  const raw = _decode(buffer, dataStart, dataEnd);
  if (verbatim) {
    // Format: "txt:..." — first 3 chars are the format tag, then ':'.
    const colon = raw.indexOf(':');
    return {
      value: {
        kind: 'verbatim',
        format: colon > 0 ? raw.slice(0, colon) : '',
        value: colon > 0 ? raw.slice(colon + 1) : raw,
      },
      consumed: dataEnd + 2 - offset,
    };
  }
  return {
    value: { kind: 'bulk', value: raw },
    consumed: dataEnd + 2 - offset,
  };
}

function _parseAggregate(
  buffer: Uint8Array,
  offset: number,
  kind: 'array' | 'set' | 'push' | 'map',
): ParseResult {
  const lenEnd = _findCrlf(buffer, offset + 1);
  if (lenEnd < 0) return null;
  const count = Number.parseInt(_decode(buffer, offset + 1, lenEnd), 10);
  if (Number.isNaN(count)) {
    throw new RespError(
      `Malformed aggregate length at offset ${offset}`,
      'PROTOCOL',
    );
  }
  // RESP2 nil array: *-1\r\n
  if (count < 0 && kind === 'array') {
    return {
      value: { kind: 'array', value: null },
      consumed: lenEnd + 2 - offset,
    };
  }
  let cursor = lenEnd + 2;
  if (kind === 'map') {
    const entries: Array<[RespValue, RespValue]> = [];
    for (let i = 0; i < count; i++) {
      const key = parseReply(buffer, cursor);
      if (!key) return null;
      cursor += key.consumed;
      const value = parseReply(buffer, cursor);
      if (!value) return null;
      cursor += value.consumed;
      entries.push([key.value, value.value]);
    }
    return {
      value: { kind: 'map', value: entries },
      consumed: cursor - offset,
    };
  }
  const items: RespValue[] = [];
  for (let i = 0; i < count; i++) {
    const elem = parseReply(buffer, cursor);
    if (!elem) return null;
    cursor += elem.consumed;
    items.push(elem.value);
  }
  return {
    value: kind === 'array'
      ? { kind: 'array', value: items }
      : kind === 'set'
      ? { kind: 'set', value: items }
      : { kind: 'push', value: items },
    consumed: cursor - offset,
  };
}

function _parseNull(buffer: Uint8Array, offset: number): ParseResult {
  const end = _findCrlf(buffer, offset + 1);
  if (end < 0) return null;
  return {
    value: { kind: 'null', value: null },
    consumed: end + 2 - offset,
  };
}

function _parseBoolean(buffer: Uint8Array, offset: number): ParseResult {
  const end = _findCrlf(buffer, offset + 1);
  if (end < 0) return null;
  const raw = _decode(buffer, offset + 1, end);
  return {
    value: { kind: 'boolean', value: raw === 't' },
    consumed: end + 2 - offset,
  };
}

function _parseDouble(buffer: Uint8Array, offset: number): ParseResult {
  const end = _findCrlf(buffer, offset + 1);
  if (end < 0) return null;
  const raw = _decode(buffer, offset + 1, end);
  let value: number;
  if (raw === 'inf') value = Number.POSITIVE_INFINITY;
  else if (raw === '-inf') value = Number.NEGATIVE_INFINITY;
  else if (raw === 'nan') value = Number.NaN;
  else value = Number.parseFloat(raw);
  return {
    value: { kind: 'double', value },
    consumed: end + 2 - offset,
  };
}

function _parseBigInt(buffer: Uint8Array, offset: number): ParseResult {
  const end = _findCrlf(buffer, offset + 1);
  if (end < 0) return null;
  return {
    value: {
      kind: 'bigint',
      value: BigInt(_decode(buffer, offset + 1, end)),
    },
    consumed: end + 2 - offset,
  };
}

function _parseBulkError(buffer: Uint8Array, offset: number): ParseResult {
  // !len\r\nMESSAGE\r\n
  const lenEnd = _findCrlf(buffer, offset + 1);
  if (lenEnd < 0) return null;
  const len = Number.parseInt(_decode(buffer, offset + 1, lenEnd), 10);
  if (Number.isNaN(len)) {
    throw new RespError(
      `Malformed bulk error length at offset ${offset}`,
      'PROTOCOL',
    );
  }
  const dataStart = lenEnd + 2;
  const dataEnd = dataStart + len;
  if (dataEnd + 2 > buffer.length) return null;
  const message = _decode(buffer, dataStart, dataEnd);
  const prefix = message.split(' ', 1)[0] ?? 'ERR';
  return {
    value: { kind: 'error', value: new RespError(message, prefix) },
    consumed: dataEnd + 2 - offset,
  };
}

/**
 * Attribute frames carry metadata that precedes the real reply. The protocol
 * mandates clients silently drop them and process the next frame as the actual
 * value. We return the *next* frame, with `consumed` covering both.
 */
function _parseAttribute(buffer: Uint8Array, offset: number): ParseResult {
  const attr = _parseAggregate(buffer, offset, 'map');
  if (!attr) return null;
  const next = parseReply(buffer, offset + attr.consumed);
  if (!next) return null;
  return {
    value: next.value,
    consumed: attr.consumed + next.consumed,
  };
}

//#endregion Frame parsers

//#region Convenience converters

/**
 * Flatten a `RespValue` to a plain JS value.
 *
 * Mappings:
 * - `string`, `bulk`, `verbatim` → `string` (or `null` for nil bulk)
 * - `integer` → `number`, or `bigint` when the value exceeds ±(2^53−1)
 * - `double` → `number`
 * - `bigint` → `bigint`
 * - `boolean` → `boolean`
 * - `null` → `null`
 * - `array`, `set`, `push` → `unknown[]`
 * - `map` → `Record<string, unknown>` (string keys)
 * - `error` → throws the embedded `RespError`
 */
export function unwrap(value: RespValue): unknown {
  switch (value.kind) {
    case 'string':
    case 'verbatim':
      return value.value;
    case 'bulk':
      return value.value;
    case 'integer':
    case 'double':
      return value.value;
    case 'bigint':
      return value.value;
    case 'boolean':
      return value.value;
    case 'null':
      return null;
    case 'array':
    case 'set':
    case 'push':
      return value.value === null ? null : value.value.map(unwrap);
    case 'map': {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of value.value) {
        const key = unwrap(k);
        obj[String(key)] = unwrap(v);
      }
      return obj;
    }
    case 'error':
      throw value.value;
  }
}

//#endregion Convenience converters
