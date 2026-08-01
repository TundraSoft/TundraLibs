/**
 * @fileoverview Built-in codecs for `WebSocketServer`.
 *
 * A {@link Codec} is just a pair of functions — `encode` produces the
 * byte/string form sent over the wire, `decode` parses an incoming
 * frame back into the typed message shape (or `null` for malformed
 * input). The built-ins here cover the common cases:
 *
 * - {@link StringCodec} — identity for plain-text messages.
 * - {@link JsonCodec} — `JSON.parse` / `JSON.stringify`. Returns `null`
 *   for non-JSON input rather than throwing.
 * - {@link BinaryCodec} — identity for binary frames (`Uint8Array`).
 *
 * Pass any of these to `new WebSocketServer({ codec: ... })`, or
 * implement the {@link Codec} contract yourself.
 *
 * @module
 */

import type { Codec } from './types/mod.ts';

/**
 * Identity codec for `string` messages — passes text through unchanged
 * and rejects binary input.
 */
export const StringCodec: Codec<string> = {
  encode: (message) => message,
  decode: (raw) => (typeof raw === 'string' ? raw : null),
};

/**
 * Identity codec for binary messages — passes `Uint8Array` /
 * `ArrayBuffer` through (normalized to `Uint8Array`) and rejects text.
 */
export const BinaryCodec: Codec<Uint8Array> = {
  encode: (message) => message,
  decode: (raw) => {
    if (raw instanceof Uint8Array) return raw;
    if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
    return null;
  },
};

/**
 * JSON codec — `JSON.parse` on decode (returns `null` on parse error
 * or non-string input), `JSON.stringify` on encode.
 *
 * Decoded messages are typed as `unknown`; downstream middleware /
 * handler is responsible for asserting shape.
 */
export const JsonCodec: Codec<unknown> = {
  encode: (message) => JSON.stringify(message),
  decode: (raw) => {
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};
