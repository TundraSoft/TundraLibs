/**
 * @fileoverview compose — the onion middleware runner: order, next()
 * guards, nullish-slot skipping, error propagation.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { compose } from './compose.ts';
import { RapidError } from '../errors/mod.ts';
// deno-lint-ignore no-explicit-any
type Ctx = any;

describe('rapid.compose', () => {
  it('runs middleware outside-in, then the handler (next)', async () => {
    const order: string[] = [];
    const run = compose<Ctx, Ctx>([
      async (_c, next) => {
        order.push('a-in');
        await next();
        order.push('a-out');
      },
      async (_c, next) => {
        order.push('b-in');
        await next();
        order.push('b-out');
      },
    ]);
    await run({}, () => {
      order.push('handler');
      return Promise.resolve();
    });
    asserts.assertEquals(order, ['a-in', 'b-in', 'handler', 'b-out', 'a-out']);
  });

  it('calling next() twice rejects', async () => {
    const run = compose<Ctx, Ctx>([
      async (_c, next) => {
        await next();
        await next();
      },
    ]);
    // compose's OWN detected bug → a RapidError (RAPID_UNHANDLED), unlike a
    // middleware's own throw which propagates unwrapped (see below).
    const err = await asserts.assertRejects(
      // compose's runner may return void | Promise<void>; assertRejects needs a PromiseLike
      () => Promise.resolve(run({}, () => Promise.resolve())),
      RapidError,
      'next() called multiple times',
    );
    asserts.assertEquals(err.code, 'RAPID_UNHANDLED');
  });

  it('a nullish middleware slot is SKIPPED (handler still runs)', async () => {
    let ran = false;
    const run = compose<Ctx, Ctx>([
      // deno-lint-ignore no-explicit-any
      undefined as any,
      async (_c, next) => {
        await next();
      },
    ]);
    await run({}, () => {
      ran = true;
      return Promise.resolve();
    });
    asserts.assert(ran);
  });

  it('a short-circuit (no next) stops the chain before the handler', async () => {
    let handlerRan = false;
    const run = compose<Ctx, Ctx>([
      () => Promise.resolve(), // never calls next
    ]);
    await run({}, () => {
      handlerRan = true;
      return Promise.resolve();
    });
    asserts.assertEquals(handlerRan, false);
  });

  it('a throwing middleware propagates', async () => {
    const run = compose<Ctx, Ctx>([
      () => {
        throw new Error('boom');
      },
    ]);
    await asserts.assertRejects(
      // compose's runner may return void | Promise<void>; assertRejects needs a PromiseLike
      () => Promise.resolve(run({}, () => Promise.resolve())),
      Error,
      'boom',
    );
  });

  it('an empty chain runs just the handler', async () => {
    let ran = false;
    await compose<Ctx, Ctx>([])({}, () => {
      ran = true;
      return Promise.resolve();
    });
    asserts.assert(ran);
  });
});

describe('rapid.compose — abandoned next()', () => {
  it('a handler rejection after a middleware forgot to return/await next() is owned (logged), never unhandled', async () => {
    const logged: unknown[] = [];
    const ctx = {
      requestId: 'r1',
      action: 'GET /x',
      app: { log: { warn: (...args: unknown[]) => logged.push(args) } },
    };
    const run = compose<Ctx, Ctx>([
      (_c, next) => {
        void next(); // fire-and-forget — the chain resolves before the handler
        return Promise.resolve();
      },
    ]);
    await run(ctx, () => Promise.reject(new Error('late boom')));
    await new Promise((r) => setTimeout(r, 0));
    asserts.assertEquals(logged.length, 1);
    asserts.assertStringIncludes(String(logged[0]), 'abandoned next()');
  });

  it("a rejection flowing through an AWAITED or RETURNED next() is the middleware's — never logged", async () => {
    const logged: unknown[] = [];
    const ctx = {
      requestId: 'r2',
      action: 'GET /x',
      app: {
        log: {
          warn: (...args: unknown[]) => logged.push(args),
          error: (...args: unknown[]) => logged.push(args),
        },
      },
    };
    const failing = () => Promise.reject(new Error('plain 4xx'));
    for (
      const mw of [
        async (_c: Ctx, next: () => void | Promise<void>) => {
          await next();
        },
        (_c: Ctx, next: () => void | Promise<void>) => next(),
        async (_c: Ctx, next: () => void | Promise<void>) => {
          try {
            await next();
          } catch (e) {
            throw e; // observed and re-thrown — still owned
          }
        },
      ]
    ) {
      await asserts.assertRejects(
        () => compose<Ctx, Ctx>([mw])(ctx, failing) as Promise<void>,
        Error,
        'plain 4xx',
      );
    }
    await new Promise((r) => setTimeout(r, 0));
    asserts.assertEquals(logged, []);
  });

  it('a synchronous middleware that drops next() is still caught as abandoned', async () => {
    const logged: unknown[] = [];
    const ctx = {
      requestId: 'r3',
      action: 'GET /x',
      app: { log: { warn: (...args: unknown[]) => logged.push(args) } },
    };
    await compose<Ctx, Ctx>([(_c, next) => {
      void next();
    }])(ctx, () => Promise.reject(new Error('late')));
    await new Promise((r) => setTimeout(r, 0));
    asserts.assertEquals(logged.length, 1);
  });
});
