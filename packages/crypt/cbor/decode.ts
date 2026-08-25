/**
 * @fileoverview A minimal CBOR (RFC 8949) decoder, scoped to the profile
 * WebAuthn / CTAP2 uses.
 *
 * CTAP2 authenticators MUST emit **canonical** CBOR — definite lengths, no
 * indefinite-length items — so this decoder deliberately supports only that
 * subset: unsigned/negative integers, byte and text strings, arrays, maps,
 * the simple values (`false`/`true`/`null`/`undefined`), and floats. Maps
 * decode to a `Map` so COSE's negative-integer key labels survive. Tags
 * (major type 6) and indefinite lengths are rejected — they never appear in
 * an `attestationObject`, `authenticatorData`, or a COSE key.
 *
 * @module
 */

import { CBORError } from './errors/mod.ts';
import type { CBORValue } from './types/mod.ts';

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });
/** Largest integer still representable exactly as a JS `number`. */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Cursor over the input bytes; every read advances and bounds-checks. */
class Reader {
  private __pos: number;

  constructor(private readonly __data: Uint8Array, start: number) {
    this.__pos = start;
  }

  get pos(): number {
    return this.__pos;
  }

  get done(): boolean {
    return this.__pos >= this.__data.length;
  }

  /** Read one byte or throw at end-of-input. */
  u8(): number {
    if (this.__pos >= this.__data.length) {
      throw new CBORError('unexpected end of input', { offset: this.__pos });
    }
    return this.__data[this.__pos++]!;
  }

  /** Read `n` raw bytes (a subarray view — no copy). */
  take(n: number): Uint8Array {
    if (this.__pos + n > this.__data.length) {
      throw new CBORError(
        `unexpected end of input (needed ${n} bytes)`,
        { offset: this.__pos },
      );
    }
    const out = this.__data.subarray(this.__pos, this.__pos + n);
    this.__pos += n;
    return out;
  }
}

/**
 * Read the integer argument that follows a CBOR initial byte, per its
 * additional-info bits. Returns a `bigint` only when an 8-byte argument
 * exceeds the safe-integer range.
 */
function readArgument(reader: Reader, additionalInfo: number): number | bigint {
  if (additionalInfo < 24) return additionalInfo;
  if (additionalInfo === 24) return reader.u8();
  if (additionalInfo === 25) return (reader.u8() << 8) | reader.u8();
  if (additionalInfo === 26) {
    // Build with multiplication (not `<<`) so the top bit stays positive —
    // a 4-byte value can exceed 2^31 but is always a safe integer (< 2^32).
    return reader.u8() * 0x1000000 + (reader.u8() << 16) +
      (reader.u8() << 8) + reader.u8();
  }
  if (additionalInfo === 27) {
    let value = 0n;
    for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(reader.u8());
    return value <= MAX_SAFE ? Number(value) : value;
  }
  if (additionalInfo === 31) {
    throw new CBORError(
      'indefinite-length items are not supported (CTAP2 canonical CBOR only)',
      { offset: reader.pos },
    );
  }
  throw new CBORError(
    `reserved additional-info value ${additionalInfo}`,
    { offset: reader.pos },
  );
}

/** A length must be a non-negative `number` — reject bigint-scale lengths. */
function asLength(value: number | bigint, offset: number): number {
  if (typeof value === 'bigint') {
    throw new CBORError('length exceeds supported range', { offset });
  }
  return value;
}

/** IEEE 754 half-precision (16-bit) float → number. */
function decodeHalf(hi: number, lo: number): number {
  const bits = (hi << 8) | lo;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  if (exponent === 0) return sign * mantissa * 2 ** -24; // subnormal / zero
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * (mantissa + 1024) * 2 ** (exponent - 25);
}

/** Decode one data item at the reader's current position. */
function decodeItem(reader: Reader): CBORValue {
  const initial = reader.u8();
  const majorType = initial >> 5;
  const additionalInfo = initial & 0x1f;

  switch (majorType) {
    case 0: // unsigned integer
      return readArgument(reader, additionalInfo);
    case 1: { // negative integer: -1 - n
      const n = readArgument(reader, additionalInfo);
      return typeof n === 'bigint' ? -1n - n : -1 - n;
    }
    case 2: // byte string — copy out so the result owns its bytes
      return reader.take(
        asLength(readArgument(reader, additionalInfo), reader.pos),
      ).slice();
    case 3: // text string (UTF-8)
      return TEXT_DECODER.decode(
        reader.take(asLength(readArgument(reader, additionalInfo), reader.pos)),
      );
    case 4: { // array
      const length = asLength(readArgument(reader, additionalInfo), reader.pos);
      const items: CBORValue[] = [];
      for (let i = 0; i < length; i++) items.push(decodeItem(reader));
      return items;
    }
    case 5: { // map
      const length = asLength(readArgument(reader, additionalInfo), reader.pos);
      const map = new Map<CBORValue, CBORValue>();
      for (let i = 0; i < length; i++) {
        const key = decodeItem(reader);
        map.set(key, decodeItem(reader));
      }
      return map;
    }
    case 6: // tagged item — never present in the WebAuthn structures
      throw new CBORError('CBOR tags are not supported', {
        offset: reader.pos,
      });
    case 7: // simple values and floats
      switch (additionalInfo) {
        case 20:
          return false;
        case 21:
          return true;
        case 22:
          return null;
        case 23:
          return undefined;
        case 25:
          return decodeHalf(reader.u8(), reader.u8());
        case 26:
          return new DataView(reader.take(4).slice().buffer).getFloat32(0);
        case 27:
          return new DataView(reader.take(8).slice().buffer).getFloat64(0);
        default:
          throw new CBORError(
            `unsupported simple value ${additionalInfo}`,
            { offset: reader.pos },
          );
      }
    default: // unreachable — majorType is 3 bits (0-7), all handled above
      throw new CBORError(`unknown major type ${majorType}`, {
        offset: reader.pos,
      });
  }
}

/**
 * Decode a single CBOR item that spans the whole of `data`.
 *
 * @param data - the CBOR bytes (exactly one top-level item, e.g. an
 *   `attestationObject`).
 * @returns the decoded {@link CBORValue}.
 * @throws {@link CBORError} on malformed bytes, an unsupported feature
 *   (tags, indefinite lengths), or trailing bytes after the item.
 */
export function decodeCBOR(data: Uint8Array): CBORValue {
  const reader = new Reader(data, 0);
  const value = decodeItem(reader);
  if (!reader.done) {
    throw new CBORError('unexpected trailing bytes', { offset: reader.pos });
  }
  return value;
}

/**
 * Decode one CBOR item starting at `offset`, returning it plus the offset
 * just past it — for items embedded in a larger buffer (a COSE key sits
 * inside `authenticatorData`, possibly followed by CBOR extensions).
 *
 * @param data - the buffer containing the item.
 * @param offset - byte index to start at (default `0`).
 * @returns the decoded `value` and the `offset` after it.
 * @throws {@link CBORError} on malformed bytes or an unsupported feature.
 */
export function decodeCBORItem(
  data: Uint8Array,
  offset = 0,
): { value: CBORValue; offset: number } {
  const reader = new Reader(data, offset);
  const value = decodeItem(reader);
  return { value, offset: reader.pos };
}
