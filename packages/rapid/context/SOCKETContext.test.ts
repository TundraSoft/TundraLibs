/**
 * @fileoverview Tests for `SOCKETContext` — the per-frame websocket context.
 * Covers what makes it distinct from the base: `payload` is the decoded frame
 * VERBATIM while `args.params` is a FROZEN COPY (freezing args must not freeze
 * the caller's payload), a non-plain-object payload is a 400 at first args
 * access, and the same 3xx/stream rejections the socket outcome enforces.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { type SOCKETConnection, SOCKETContext } from './SOCKETContext.ts';
import { RapidError } from '../errors/mod.ts';

const makeApp = () =>
  Application.initialize({
    name: 'sockctx',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

const connection = (): SOCKETConnection => ({
  id: 'conn-1',
  query: {},
  headers: new Headers(),
});

const make = async (payload: unknown, command = 'doThing') => {
  const app = await makeApp();
  return new SOCKETContext(app, {
    connection: connection(),
    command,
    payload,
    frameId: 'f-9',
  });
};

describe('rapid.context.SOCKETContext', () => {
  it('exposes connection identity and echoes the frame id', async () => {
    const ctx = await make({});
    asserts.assertEquals(ctx.connectionId, 'conn-1');
    asserts.assertEquals(ctx.frameId, 'f-9');
    asserts.assertEquals(ctx.command, 'doThing');
    asserts.assertEquals(ctx.action, 'doThing'); // action mirrors the command
  });

  it('payload is the frame VERBATIM; args.params is a frozen COPY that leaves payload mutable', async () => {
    const frame = { a: 1 };
    const ctx = await make(frame);
    // Same object out of payload…
    asserts.assertStrictEquals(ctx.payload, frame);
    // …but args.params is a distinct, frozen copy.
    asserts.assertEquals(ctx.args.params, { a: 1 });
    asserts.assertNotStrictEquals(ctx.args.params, frame);
    asserts.assertThrows(() => {
      (ctx.args.params as Record<string, unknown>).a = 2;
    });
    // Freezing args must NOT have frozen the caller's payload.
    (ctx.payload as Record<string, unknown>).a = 99;
    asserts.assertEquals((ctx.payload as Record<string, unknown>).a, 99);
  });

  it('an absent payload yields empty params', async () => {
    asserts.assertEquals((await make(undefined)).args.params, {});
    asserts.assertEquals((await make(null)).args.params, {});
  });

  it('a non-plain-object payload is RAPID_VALIDATION_FAILED at first args access', async () => {
    for (const bad of [[1, 2], new Date(), 'str', 42] as unknown[]) {
      const ctx = await make(bad);
      asserts.assertEquals(
        asserts.assertThrows(() => ctx.args, RapidError).code,
        'RAPID_VALIDATION_FAILED',
        `expected 400 for ${JSON.stringify(bad)}`,
      );
    }
  });

  it('rejects a 3xx status and a stream body on the outcome', async () => {
    const a = await make({});
    asserts.assertEquals(
      asserts.assertThrows(() => {
        a.response = { status: 301, content: 'x' };
      }, RapidError).code,
      'RAPID_RESPONSE_INVALID',
    );
    const b = await make({});
    asserts.assertEquals(
      asserts.assertThrows(() => {
        b.response = { content: new ReadableStream() };
      }, RapidError).code,
      'RAPID_RESPONSE_INVALID',
    );
  });

  it('respond() yields the { status, content } frame outcome', async () => {
    const ctx = await make({});
    ctx.response = { status: 202, content: { ok: true } };
    asserts.assertEquals(ctx.respond(), { status: 202, content: { ok: true } });
  });
});
