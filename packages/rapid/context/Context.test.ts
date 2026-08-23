/**
 * @fileoverview Tests for the abstract base `Context` — the transport-agnostic
 * behaviors every context inherits (auth set-once, the respond() point-of-
 * no-return, detached-work absorption, requestId mint-vs-adopt, and the base
 * being CONTENT-ONLY so a status set at the base is ignored until a subtype
 * consumes it). Exercised through a minimal concrete subclass, since `Context`
 * is abstract.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { Context } from './Context.ts';
import { RapidError } from '../errors/mod.ts';
import type { RapidContextArgs } from '../types/mod.ts';

const makeApp = () =>
  Application.initialize({
    name: 'ctxbase',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

/** The lightest possible concrete Context — no transport semantics. */
class TestContext extends Context<Record<string, unknown>, { done: true }> {
  public readonly type = 'JOB' as const;
  // Base `args` is abstract and tested in the JOB/SOCKET subtypes; a stub
  // is enough for the base-behavior vehicle here.
  public get args(): Readonly<RapidContextArgs> {
    return {} as Readonly<RapidContextArgs>;
  }
  protected _respond(): { done: true } {
    return { done: true };
  }
}

describe('rapid.context.Context (base)', () => {
  it('mints a requestId when none is supplied, adopts a supplied one', async () => {
    const app = await makeApp();
    const minted = new TestContext(app, { action: 'a' });
    asserts.assert(
      typeof minted.requestId === 'string' && minted.requestId.length > 0,
    );
    const adopted = new TestContext(app, { action: 'a', requestId: 'fixed-1' });
    asserts.assertEquals(adopted.requestId, 'fixed-1');
  });

  it('setAuth writes the bag once; a second call throws RAPID_CONFIG', async () => {
    const app = await makeApp();
    const ctx = new TestContext(app, { action: 'a' });
    asserts.assertEquals(ctx.auth, undefined);
    ctx.setAuth({ user: 'ada' });
    asserts.assertEquals(ctx.auth, { user: 'ada' });
    const err = asserts.assertThrows(
      () => ctx.setAuth({ user: 'grace' }),
      RapidError,
    );
    asserts.assertEquals((err as RapidError).code, 'RAPID_CONFIG');
    // The first identity survives the rejected overwrite.
    asserts.assertEquals(ctx.auth, { user: 'ada' });
  });

  it('the base response is CONTENT-ONLY: a status set here is ignored (subtypes consume it)', async () => {
    const app = await makeApp();
    const ctx = new TestContext(app, { action: 'a' });
    asserts.assertEquals(ctx.status, 200);
    asserts.assertEquals(ctx.response, null);
    ctx.response = { status: 500, content: 'body' };
    // Base stores content only — status stays the default, response omits it.
    asserts.assertEquals(ctx.status, 200);
    asserts.assertEquals(ctx.response, { content: 'body' });
    // null clears it.
    ctx.response = null;
    asserts.assertEquals(ctx.response, null);
  });

  it('respond() is once-only and freezes the context', async () => {
    const app = await makeApp();
    const ctx = new TestContext(app, { action: 'a' });
    asserts.assertEquals(ctx.respond(), { done: true });
    // Second respond() throws.
    asserts.assertEquals(
      asserts.assertThrows(() => ctx.respond(), RapidError).code,
      'RAPID_RESPONSE_INVALID',
    );
    // And the setter is frozen too.
    asserts.assertEquals(
      asserts.assertThrows(() => {
        ctx.response = { content: 'late' };
      }, RapidError).code,
      'RAPID_RESPONSE_INVALID',
    );
  });

  it('detach absorbs a rejection (no unhandled rejection) and settleDetached awaits the work', async () => {
    const app = await makeApp();
    const ctx = new TestContext(app, { action: 'a' });
    // A rejecting detached promise must not surface as an unhandled rejection.
    ctx.detach(Promise.reject(new Error('abandoned')));
    let ran = false;
    ctx.detach(
      new Promise<void>((r) =>
        setTimeout(() => {
          ran = true;
          r();
        }, 5)
      ),
    );
    await ctx.settleDetached(); // never rejects
    asserts.assert(ran, 'settleDetached must await outstanding detached work');
  });

  it('ctx.config is the application config (identity), on every context', async () => {
    const app = await makeApp();
    const ctx = new TestContext(app, { action: 'a' });
    asserts.assertStrictEquals(ctx.config, app.config);
    // A programmatic app has no config sets loaded.
    asserts.assertEquals(ctx.config.has('anything.at.all'), false);
  });

  it('settleDetached resolves immediately when nothing was detached', async () => {
    const app = await makeApp();
    const ctx = new TestContext(app, { action: 'a' });
    await ctx.settleDetached();
  });
});
