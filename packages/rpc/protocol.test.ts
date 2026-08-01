/**
 * @fileoverview Tests for the wire-protocol codec.
 */

import { describe, it } from '@tundralibs/compat/test';
import { decodeFrame, encodeFrame, recoverFrameId } from './protocol.ts';
import type { OutboundFrame } from './types/mod.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'rpc.protocol',
  fn: () => {
    describe('encodeFrame()', () => {
      it('encodes a result-ok frame', () => {
        const frame: OutboundFrame = {
          id: '1',
          type: 'result',
          ok: true,
          data: { x: 1 },
        };
        asserts.assertStrictEquals(
          encodeFrame(frame),
          '{"id":"1","type":"result","ok":true,"data":{"x":1}}',
        );
      });

      it('encodes a result-error frame', () => {
        const frame: OutboundFrame = {
          id: '2',
          type: 'result',
          ok: false,
          error: { code: 'BAD', message: 'broken' },
        };
        const encoded = encodeFrame(frame);
        asserts.assert(encoded.includes('"ok":false'));
        asserts.assert(encoded.includes('"code":"BAD"'));
      });

      it('encodes a msg frame (no id)', () => {
        const frame: OutboundFrame = {
          type: 'msg',
          channel: 'chat:room1',
          data: 'hello',
        };
        asserts.assertStrictEquals(
          encodeFrame(frame),
          '{"type":"msg","channel":"chat:room1","data":"hello"}',
        );
      });
    });

    describe('decodeFrame()', () => {
      it('parses a cmd frame', () => {
        const result = decodeFrame(
          '{"id":"1","type":"cmd","cmd":"foo","payload":{"a":1}}',
        );
        asserts.assertEquals(result, {
          id: '1',
          type: 'cmd',
          cmd: 'foo',
          payload: { a: 1 },
        });
      });

      it('parses a cmd frame without payload', () => {
        const result = decodeFrame('{"id":"1","type":"cmd","cmd":"foo"}');
        asserts.assertEquals(result, {
          id: '1',
          type: 'cmd',
          cmd: 'foo',
          payload: undefined,
        });
      });

      it('parses sub / unsub frames', () => {
        const sub = decodeFrame(
          '{"id":"1","type":"sub","channel":"x"}',
        );
        asserts.assertEquals(sub, { id: '1', type: 'sub', channel: 'x' });

        const unsub = decodeFrame(
          '{"id":"2","type":"unsub","channel":"y"}',
        );
        asserts.assertEquals(unsub, { id: '2', type: 'unsub', channel: 'y' });
      });

      it('parses a pub frame', () => {
        const result = decodeFrame(
          '{"id":"1","type":"pub","channel":"x","payload":42}',
        );
        asserts.assertEquals(result, {
          id: '1',
          type: 'pub',
          channel: 'x',
          payload: 42,
        });
      });

      it('returns null on invalid JSON', () => {
        asserts.assertStrictEquals(decodeFrame('not json'), null);
        asserts.assertStrictEquals(decodeFrame(''), null);
        asserts.assertStrictEquals(decodeFrame('{['), null);
      });

      it('returns null on non-object JSON', () => {
        asserts.assertStrictEquals(decodeFrame('null'), null);
        asserts.assertStrictEquals(decodeFrame('"string"'), null);
        asserts.assertStrictEquals(decodeFrame('42'), null);
        asserts.assertStrictEquals(decodeFrame('[]'), null);
      });

      it('returns null when id is missing or wrong type', () => {
        asserts.assertStrictEquals(
          decodeFrame('{"type":"cmd","cmd":"foo"}'),
          null,
        );
        asserts.assertStrictEquals(
          decodeFrame('{"id":42,"type":"cmd","cmd":"foo"}'),
          null,
        );
        asserts.assertStrictEquals(
          decodeFrame('{"id":"","type":"cmd","cmd":"foo"}'),
          null,
        );
      });

      it('returns null when type is unknown', () => {
        asserts.assertStrictEquals(
          decodeFrame('{"id":"1","type":"weird"}'),
          null,
        );
      });

      it('returns null when cmd is missing on cmd frame', () => {
        asserts.assertStrictEquals(
          decodeFrame('{"id":"1","type":"cmd"}'),
          null,
        );
      });

      it('returns null when channel is missing on sub/pub', () => {
        asserts.assertStrictEquals(
          decodeFrame('{"id":"1","type":"sub"}'),
          null,
        );
        asserts.assertStrictEquals(
          decodeFrame('{"id":"1","type":"pub","payload":1}'),
          null,
        );
      });

      it('returns null when payload is missing on pub', () => {
        asserts.assertStrictEquals(
          decodeFrame('{"id":"1","type":"pub","channel":"x"}'),
          null,
        );
      });
    });

    describe('recoverFrameId()', () => {
      it('recovers the id from a frame decodeFrame rejects', () => {
        // Well-formed JSON with a valid id but an unknown type — rejected
        // by decodeFrame, yet the id is correlatable.
        asserts.assertStrictEquals(
          recoverFrameId('{"id":"1","type":"weird"}'),
          '1',
        );
        // Missing required field (cmd) — still carries a usable id.
        asserts.assertStrictEquals(
          recoverFrameId('{"id":"7","type":"cmd"}'),
          '7',
        );
        // Missing payload on a pub — the publish(undefined) regression shape.
        asserts.assertStrictEquals(
          recoverFrameId('{"id":"9","type":"pub","channel":"x"}'),
          '9',
        );
      });

      it('returns undefined when no usable id is present', () => {
        // Not JSON at all.
        asserts.assertStrictEquals(recoverFrameId('not json'), undefined);
        asserts.assertStrictEquals(recoverFrameId(''), undefined);
        // JSON but not an object.
        asserts.assertStrictEquals(recoverFrameId('null'), undefined);
        asserts.assertStrictEquals(recoverFrameId('42'), undefined);
        asserts.assertStrictEquals(recoverFrameId('[]'), undefined);
        // Object with no id, or an id of the wrong type / empty.
        asserts.assertStrictEquals(recoverFrameId('{"type":"cmd"}'), undefined);
        asserts.assertStrictEquals(
          recoverFrameId('{"id":42,"type":"cmd"}'),
          undefined,
        );
        asserts.assertStrictEquals(
          recoverFrameId('{"id":"","type":"cmd"}'),
          undefined,
        );
      });
    });
  },
});
