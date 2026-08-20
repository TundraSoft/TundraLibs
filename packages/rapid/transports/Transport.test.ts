/**
 * @fileoverview Transport._invoke — the shared invocation cycle. Locks
 * R1: a synchronous onion + finalize finishes WITHOUT allocating a
 * request promise (returns the value directly), while an async onion
 * still returns a promise. Also pins the invariants the collapse must
 * preserve: ambient correlation active across the cycle, and any throw
 * disclosed onto ctx.response with finalize still running.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { ambient } from '@tundralibs/ambient';
import { Application } from '../Application.ts';
import { HTTPContext } from '../context/mod.ts';
import type { RapidContextState } from '../types/mod.ts';
import { Transport } from './Transport.ts';

// Minimal concrete transport that exposes the protected cycle.
class TestTransport<S extends RapidContextState = RapidContextState>
  extends Transport<S> {
  start(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
  public run<R>(
    ctx: HTTPContext<S>,
    chain: (c: HTTPContext<S>, next: () => void | Promise<void>) =>
      | void
      | Promise<void>,
    dispatch: () => void | Promise<void>,
    finalize?: () => R | Promise<R>,
  ): R | Promise<R> {
    return this._invoke(ctx, chain, dispatch, undefined, undefined, finalize);
  }
}

const newCtx = (app: Application) =>
  new HTTPContext(app, {
    request: new Request('http://localhost/'),
    remoteAddress: '127.0.0.1',
    action: 'GET /',
    matched: true,
    requestId: 'req-fixed',
  });

const passthrough = (_c: unknown, next: () => void | Promise<void>) => next();

describe('rapid.Transport._invoke', () => {
  it('R1: a sync onion + sync finalize returns SYNCHRONOUSLY (no promise)', () => {
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    let handlerRan = false;
    const out = t.run(
      newCtx(app),
      passthrough,
      () => {
        handlerRan = true;
      },
      () => 'FINALIZED',
    );
    asserts.assert(
      !(out instanceof Promise),
      'sync path must not allocate a promise',
    );
    asserts.assert(handlerRan);
    asserts.assertEquals(out, 'FINALIZED');
  });

  it('an async handler still returns a promise (resolves to finalize)', async () => {
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    const out = t.run(
      newCtx(app),
      passthrough,
      () => Promise.resolve(), // async dispatch
      () => 'FINALIZED',
    );
    asserts.assert(out instanceof Promise, 'async path must be a promise');
    asserts.assertEquals(await out, 'FINALIZED');
  });

  it('ambient correlation is active inside the onion AND finalize', () => {
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    let inOnion: string | undefined;
    let inFinalize: string | undefined;
    t.run(
      newCtx(app),
      passthrough,
      () => {
        inOnion = ambient.get()?.requestId as string | undefined;
      },
      () => {
        inFinalize = ambient.get()?.requestId as string | undefined;
        return undefined;
      },
    );
    asserts.assertEquals(inOnion, 'req-fixed');
    asserts.assertEquals(inFinalize, 'req-fixed');
  });

  it('a SYNC throw is disclosed onto ctx.response; finalize still runs', () => {
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    const ctx = newCtx(app);
    let finalizeRan = false;
    // A throwing dispatch must NOT escape _invoke — it becomes a
    // disclosure override, and finalize (the response step) still runs.
    const out = t.run(
      ctx,
      passthrough,
      () => {
        throw new Error('boom');
      },
      () => {
        finalizeRan = true;
        return 'FINALIZED';
      },
    );
    asserts.assert(!(out instanceof Promise), 'sync throw stays sync');
    asserts.assertEquals(out, 'FINALIZED');
    asserts.assert(finalizeRan);
    asserts.assert(ctx.response !== null, 'error was disclosed onto response');
    asserts.assertEquals(ctx.status, 500);
  });
});
