/**
 * @fileoverview `Application.requestIdGenerator` — the process-wide request-id
 * minter. The default is a crypto-free sequenceID; a set generator is what
 * `newRequestId` mints with; and the setter BLIND-CALLS the candidate so a
 * non-function, a throwing function, or a non-string / unsafe output fails at
 * assignment (RAPID_CONFIG), never on the first request.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { sequenceID, ulid } from '@tundralibs/id';
import { Application } from './Application.ts';
import { RapidError } from './errors/mod.ts';

const SAFE = /^[A-Za-z0-9._-]{1,64}$/;
const make = () =>
  Application.initialize({
    name: 'rid',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

describe('Application.requestIdGenerator', () => {
  it('default mints a safe, non-empty string that differs per call', async () => {
    const app = await make();
    const a = app.newRequestId();
    const b = app.newRequestId();
    asserts.assert(SAFE.test(a), `unsafe id ${a}`);
    asserts.assertNotEquals(a, b);
  });

  it('a set generator is what newRequestId mints with (restored after)', async () => {
    const prior = Application.requestIdGenerator;
    try {
      let n = 0;
      Application.requestIdGenerator = () => `req-${++n}`;
      const app = await make();
      asserts.assertEquals(app.newRequestId(), 'req-2'); // the setter consumed req-1
      asserts.assertEquals(app.newRequestId(), 'req-3');
      // And it rides the response header end-to-end.
      app.get('/', () => ({ content: '' }));
      const res = await app.fetch(new Request('http://app/'));
      asserts.assertEquals(res.headers.get('x-request-id'), 'req-4');
    } finally {
      Application.requestIdGenerator = prior;
    }
  });

  it('an inbound safe id is still adopted over the generator', async () => {
    const app = await make();
    asserts.assertEquals(app.newRequestId('edge-abc.1'), 'edge-abc.1');
  });

  it('rejects a non-function at assignment', () => {
    const prior = Application.requestIdGenerator;
    asserts.assertThrows(
      () => {
        Application.requestIdGenerator = 'nope' as unknown as () => string;
      },
      RapidError,
      'must be a function',
    );
    asserts.assertStrictEquals(Application.requestIdGenerator, prior); // unchanged
  });

  it('rejects a generator that throws when blind-called', () => {
    const prior = Application.requestIdGenerator;
    asserts.assertThrows(
      () => {
        Application.requestIdGenerator = () => {
          throw new Error('boom');
        };
      },
      RapidError,
      'threw',
    );
    asserts.assertStrictEquals(Application.requestIdGenerator, prior);
  });

  it('rejects a non-string output — a raw sequenceID() returns bigint', () => {
    const prior = Application.requestIdGenerator;
    const raw = sequenceID(); // returns bigint, not string
    asserts.assertThrows(
      () => {
        Application.requestIdGenerator = raw as unknown as () => string;
      },
      RapidError,
      'non-empty string',
    );
    asserts.assertStrictEquals(Application.requestIdGenerator, prior);
  });

  it('rejects an unsafe output (injection chars / too long / empty)', () => {
    const prior = Application.requestIdGenerator;
    for (const bad of ['a\nb', 'x'.repeat(65), '']) {
      asserts.assertThrows(
        () => {
          Application.requestIdGenerator = () => bad;
        },
        RapidError,
      );
    }
    asserts.assertStrictEquals(Application.requestIdGenerator, prior);
  });

  it('a real alternative (ulid) is accepted and used', async () => {
    const prior = Application.requestIdGenerator;
    try {
      Application.requestIdGenerator = ulid;
      const app = await make();
      asserts.assertEquals(app.newRequestId().length, 26);
    } finally {
      Application.requestIdGenerator = prior;
    }
  });
});
