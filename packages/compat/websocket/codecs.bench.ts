/**
 * @fileoverview Benchmarks for the WebSocket codecs — encode/decode run
 * on every frame, so their per-call cost is on the message hot path.
 * `String`/`Binary` are near-identity; `Json` carries the real work
 * (`JSON.stringify`/`JSON.parse`), benched on a small and a large
 * payload plus the malformed-input `null` branch.
 *
 * @module
 */

import { bench } from '../bench.ts';
import { BinaryCodec, JsonCodec, StringCodec } from './codecs.ts';

const SMALL_OBJ = { type: 'msg', id: 1, ok: true };
const LARGE_OBJ = {
  type: 'batch',
  items: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    tags: ['a', 'b', 'c'],
    active: i % 2 === 0,
  })),
};
const SMALL_JSON = JSON.stringify(SMALL_OBJ);
const LARGE_JSON = JSON.stringify(LARGE_OBJ);
const MALFORMED = '{ not valid json';

const TEXT = 'a plain text websocket message';
const BYTES = new Uint8Array(1024).fill(7);
const BUFFER = BYTES.buffer;

// JSON codec — the one with real cost.
bench('JsonCodec.encode - small object', () => JsonCodec.encode(SMALL_OBJ));
bench('JsonCodec.encode - large object', () => JsonCodec.encode(LARGE_OBJ));
bench('JsonCodec.decode - small object', () => JsonCodec.decode(SMALL_JSON));
bench('JsonCodec.decode - large object', () => JsonCodec.decode(LARGE_JSON));
bench('JsonCodec.decode - malformed → null', () => JsonCodec.decode(MALFORMED));

// String codec — identity, the floor for the codec dispatch.
bench('StringCodec.encode', () => StringCodec.encode(TEXT));
bench('StringCodec.decode', () => StringCodec.decode(TEXT));

// Binary codec — identity for Uint8Array, wrap for ArrayBuffer.
bench('BinaryCodec.encode', () => BinaryCodec.encode(BYTES));
bench('BinaryCodec.decode - Uint8Array', () => BinaryCodec.decode(BYTES));
bench(
  'BinaryCodec.decode - ArrayBuffer wrap',
  () => BinaryCodec.decode(BUFFER),
);
