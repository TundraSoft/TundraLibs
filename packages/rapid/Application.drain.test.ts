/**
 * @fileoverview Graceful shutdown: with a `shutdownTimeout` window,
 * `app.stop()` drains an in-flight request to its real response instead
 * of force-dropping the connection (the pre-drain behavior). Exercises
 * the Application.stop → HTTPTransport.stop(drainMs) → WebServer.stop(true,
 * drainMs) wiring end-to-end over a real listener.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('rapid.Application graceful drain', () => {
  it('drains an in-flight request on stop() when a shutdown window is set', async () => {
    let markEntered = () => {};
    const entered = new Promise<void>((r) => {
      markEntered = r;
    });
    const app = await Application.initialize({
      name: 'drain-test',
      // A generous window: the drain finishes in ~150ms, well under it, so
      // the unref'd exit backstop (armed at 1.1x, cleared on completion)
      // never fires.
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      shutdownTimeout: 5_000,
    });
    app.get('/slow', async () => {
      markEntered();
      await sleep(150);
      return { content: { ok: true } };
    });

    await app.start();
    const base = `http://127.0.0.1:${app.port}`;
    // Fire but don't await; wait until the handler has actually started so
    // the request is genuinely in-flight (not idle) when we stop.
    const inflight = fetch(`${base}/slow`).then((r) => r.json());
    await entered;

    const t0 = Date.now();
    await app.stop();
    const body = await inflight;
    const elapsed = Date.now() - t0;

    // Drained to its real response — a force-close would have reset the
    // connection (fetch rejects) or returned before the handler finished.
    asserts.assertEquals(body.ok, true);
    asserts.assert(
      elapsed >= 60,
      `stop() resolved too early (${elapsed}ms); it did not drain`,
    );
  });
});
