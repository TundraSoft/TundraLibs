/**
 * @fileoverview socketOutcome — framework disclosure passthrough vs
 * handler-authored errors (status-derived code + content as data).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { socketOutcome } from './socketOutcome.ts';

describe('rapid.socketOutcome', () => {
  it('a framework disclosure payload passes through verbatim', () => {
    // RapidError.payload() output: code + message, nothing to add.
    asserts.assertEquals(
      socketOutcome(403, { code: 'RAPID_ACCESS_DENIED', message: 'Denied' }),
      { code: 'RAPID_ACCESS_DENIED', message: 'Denied' },
    );
  });

  it('a framework disclosure payload carrying details/requestId forwards them as data', () => {
    // RapidError.payload() attaches `details` on every 4xx (both DEV
    // and PRODUCTION — errors/Base.ts), and Transport._invoke stamps
    // `requestId` onto every framework failure's body, matching the
    // HTTP shape (Transport.ts:82-87). Treating `hasCode` as "nothing
    // more to send" silently dropped both over the socket transport —
    // the same class of cross-transport data loss M2 fixed for
    // handler-authored content.
    const envelope = socketOutcome(400, {
      code: 'RAPID_VALIDATION_FAILED',
      message: 'Invalid query',
      details: { field: 'email' },
      requestId: 'req-7',
    });
    asserts.assertEquals(envelope, {
      code: 'RAPID_VALIDATION_FAILED',
      message: 'Invalid query',
      data: { details: { field: 'email' }, requestId: 'req-7' },
    });
  });

  it('R2-M2: a handler-authored error KEEPS its body as data', () => {
    // Previously: RAPID_UNHANDLED / "Internal server error", body lost.
    const envelope = socketOutcome(422, { fields: { email: 'taken' } });
    asserts.assertEquals(envelope.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(envelope.data, { fields: { email: 'taken' } });
    // Message comes from the code table, not a generic 500 string.
    asserts.assertEquals(envelope.message, 'Request validation failed');
  });

  it('R2-M2: the code is derived from the STATUS, never laundered', () => {
    // A 429 must not arrive as RAPID_UNHANDLED (the outcome matrix).
    asserts.assertEquals(
      socketOutcome(429, { retryIn: 30 }).code,
      'RAPID_RATE_LIMITED',
    );
    asserts.assertEquals(socketOutcome(404, null).code, 'RAPID_NOT_FOUND');
    asserts.assertEquals(
      socketOutcome(413, null).code,
      'RAPID_PAYLOAD_TOO_LARGE',
    );
    // 500 resolves to the generic code, not a later 500-mapped one.
    asserts.assertEquals(socketOutcome(500, null).code, 'RAPID_UNHANDLED');
  });

  it('an unmapped status falls back BY CLASS, not to a server error', () => {
    // The rpc error frame carries no status, so the code is the only
    // signal of who failed — an unmapped 4xx must not read as a 500.
    asserts.assertEquals(
      socketOutcome(418, null).code,
      'RAPID_VALIDATION_FAILED',
    );
    asserts.assertEquals(
      socketOutcome(409, null).code,
      'RAPID_VALIDATION_FAILED',
    );
    asserts.assertEquals(socketOutcome(503, null).code, 'RAPID_UNHANDLED');
  });

  it('null/undefined content adds no data field', () => {
    asserts.assertEquals(socketOutcome(500, null).data, undefined);
    asserts.assertEquals(socketOutcome(500, undefined).data, undefined);
    asserts.assert(!('data' in socketOutcome(500, null)));
  });

  it('non-object content (string, array) still rides as data', () => {
    asserts.assertEquals(socketOutcome(400, 'plain text').data, 'plain text');
    asserts.assertEquals(socketOutcome(400, [1, 2]).data, [1, 2]);
  });

  it('handler content with a NON-framework code is preserved whole (not stripped)', () => {
    // A REST-style error body that happens to carry a `code` is handler
    // content, NOT a framework disclosure — every key must survive as `data`
    // (the same cross-transport parity a framework disclosure gets).
    const out = socketOutcome(409, {
      code: 'CONFLICT',
      message: 'stale',
      current: { v: 2 },
    });
    asserts.assertEquals(out.data, {
      code: 'CONFLICT',
      message: 'stale',
      current: { v: 2 },
    });
  });

  it('a REGISTERED framework code still takes the disclosure branch', () => {
    // Only details/debug/requestId ride `data` for a real framework payload.
    const out = socketOutcome(400, {
      code: 'RAPID_VALIDATION_FAILED',
      message: 'bad',
      details: { field: 'x' },
    });
    asserts.assertEquals(out.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(out.data, { details: { field: 'x' } });
  });
});
