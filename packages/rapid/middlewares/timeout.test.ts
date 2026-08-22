/**
 * @fileoverview timeout — the deadline on HTTP and jobs, the untouched
 * fast path, and factory validation.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { JOBContext } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type { RapidContext } from '../types/mod.ts';
import { timeout } from './timeout.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('rapid.middlewares.timeout', () => {
  it('factory rejects a non-positive/non-integer budget loudly', () => {
    for (const bad of [0, -5, 1.5, NaN]) {
      asserts.assertThrows(() => timeout(bad), RapidError, 'positive integer');
    }
  });

  it('a slow HTTP handler becomes a 504 RAPID_TIMEOUT', async () => {
    const app = await Application.initialize({
      name: 'to',
      server: { port: 0 },
    });
    app.use(timeout(20));
    app.get('/slow', async () => {
      await sleep(120);
      return { content: 'too late' };
    });
    app.get('/fast', () => ({ content: 'quick' }));
    await app.start();
    const base = `http://localhost:${app.port}`;
    try {
      const slow = await fetch(`${base}/slow`);
      asserts.assertEquals(slow.status, 504);
      asserts.assertEquals((await slow.json()).code, 'RAPID_TIMEOUT');
      // The fast path is untouched by the deadline machinery.
      const fast = await fetch(`${base}/fast`);
      asserts.assertEquals(fast.status, 200);
      await fast.text();
    } finally {
      await app.stop();
      await sleep(150); // let the abandoned handler settle (no leaks)
    }
  });

  it('R2-M1: abandoned work is DETACHED so a slot-owner can hold it', async () => {
    // JS cannot cancel a promise, so the deadline only stops WAITING.
    // The still-running work must reach ctx.detach(), which is what
    // lets JOBTransport keep cronus's overlap guard held — otherwise
    // every tick starts another copy of a wedged handler.
    const app = await Application.initialize({
      name: 'det',
      server: { enabled: false },
    });
    const ctx = new JOBContext(app, {
      job: 'j',
      tick: { scheduledAt: new Date(), firedAt: new Date(), count: 1 },
    });
    let workSettled = false;
    await asserts.assertRejects(
      () =>
        timeout(20)(ctx as unknown as RapidContext, async () => {
          await sleep(150);
          workSettled = true;
        }),
      RapidError,
      'timed out',
    );
    // The deadline won and the work is still running...
    asserts.assertEquals(workSettled, false);
    // ...and settleDetached waits for it (this is the slot hold).
    await ctx.settleDetached();
    asserts.assertEquals(workSettled, true);
  });

  it('R2-M1: settleDetached absorbs a REJECTING abandoned promise', async () => {
    const app = await Application.initialize({
      name: 'det2',
      server: { enabled: false },
    });
    const ctx = new JOBContext(app, {
      job: 'j',
      tick: { scheduledAt: new Date(), firedAt: new Date(), count: 1 },
    });
    await asserts.assertRejects(
      () =>
        timeout(20)(ctx as unknown as RapidContext, async () => {
          await sleep(60);
          throw new Error('late failure nobody is listening for');
        }),
      RapidError,
    );
    // Never rethrows — the invocation already reported its outcome.
    await ctx.settleDetached();
  });

  it('a wedged job surfaces as a 504 outcome instead of silence', async () => {
    const app = await Application.initialize({
      name: 'toj',
      server: { enabled: false },
    });
    app.use(timeout(20));
    app.job('stuck', '0 6 * * *', async () => {
      await sleep(120);
      return { content: 'late' };
    });
    const outcome = await app.triggerJob('stuck');
    asserts.assertEquals(outcome.status, 504);
    asserts.assertEquals(outcome.handlerRan, true); // ran, then timed out
    await sleep(150);
  });
});
