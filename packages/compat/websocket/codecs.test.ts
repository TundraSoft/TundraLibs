/**
 * @fileoverview Tests for the built-in codecs.
 */

import { describe, it } from '../test.ts';
import { BinaryCodec, JsonCodec, StringCodec } from './codecs.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'compat.websocket.Codecs',
  fn: () => {
    describe('StringCodec', () => {
      it('passes string through on encode and decode', () => {
        asserts.assertStrictEquals(StringCodec.encode('hello'), 'hello');
        asserts.assertStrictEquals(StringCodec.decode('hello'), 'hello');
      });

      it('rejects binary on decode', () => {
        asserts.assertStrictEquals(
          StringCodec.decode(new Uint8Array([1, 2, 3])),
          null,
        );
      });
    });

    describe('BinaryCodec', () => {
      it('passes Uint8Array through', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        asserts.assertStrictEquals(BinaryCodec.encode(bytes), bytes);
        asserts.assertStrictEquals(BinaryCodec.decode(bytes), bytes);
      });

      it('normalizes ArrayBuffer to Uint8Array', () => {
        const buffer = new ArrayBuffer(3);
        new Uint8Array(buffer).set([1, 2, 3]);
        const decoded = BinaryCodec.decode(buffer);
        asserts.assert(decoded instanceof Uint8Array);
        asserts.assertEquals([...decoded!], [1, 2, 3]);
      });

      it('rejects strings on decode', () => {
        asserts.assertStrictEquals(BinaryCodec.decode('hello'), null);
      });
    });

    describe('JsonCodec', () => {
      it('round-trips an object', () => {
        const encoded = JsonCodec.encode({ x: 1, y: 'two' });
        asserts.assertStrictEquals(encoded, '{"x":1,"y":"two"}');
        asserts.assertEquals(JsonCodec.decode(encoded), { x: 1, y: 'two' });
      });

      it('returns null on invalid JSON', () => {
        asserts.assertStrictEquals(JsonCodec.decode('not json'), null);
        asserts.assertStrictEquals(JsonCodec.decode('{['), null);
      });

      it('returns null on binary input', () => {
        asserts.assertStrictEquals(
          JsonCodec.decode(new Uint8Array([1, 2, 3])),
          null,
        );
      });
    });
  },
});
