/**
 * @fileoverview Tests for reply.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Reply, reply } from './reply.ts';

describe('rapid.modules.reply', () => {
  it('reply() envelopes the exact status and content, holding content by reference', () => {
    const content = { reason: 'forbidden' };
    const envelope = reply(403, content);
    asserts.assertInstanceOf(envelope, Reply);
    asserts.assertStrictEquals(envelope.status, 403);
    // Same object, not a copy — a nested invoke's outcome passes through.
    asserts.assertStrictEquals(envelope.content, content);
  });

  it('new Reply() stores status and content directly, same as the factory', () => {
    const content = ['a', 'b'];
    const envelope = new Reply(200, content);
    asserts.assertStrictEquals(envelope.status, 200);
    asserts.assertStrictEquals(envelope.content, content);
  });
});
