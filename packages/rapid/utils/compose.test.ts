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
