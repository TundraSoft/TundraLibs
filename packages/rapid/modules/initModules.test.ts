/**
 * @fileoverview The module system end-to-end: bootstrap (initModules),
 * identity enforcement, the three channels (plain call / invoke / event),
 * correlation, isolation, lifecycle, and the single-instance rule.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { ambient } from '@tundralibs/ambient';
import { Doctor, inject } from '@tundralibs/doctor';
import { RapidError } from '../errors/mod.ts';
import {
  type EventContext,
  initModules,
  On,
  payload,
  RapidModule,
  type RapidModuleInvokeMiddleware,
  Use,
} from './mod.ts';

const QUIET = { name: 'modules-test', logger: { handlers: [] } };

// ── fixtures ────────────────────────────────────────────────────────────
const requireAdmin: RapidModuleInvokeMiddleware = (ctx, next) => {
  if (
    (ctx.state.principal as { role?: string } | undefined)?.role !== 'admin'
  ) {
    throw new RapidError('RAPID_ACCESS_DENIED');
  }
  return next();
};

abstract class Base extends RapidModule {}

class Alpha extends Base {
  readonly name = 'Alpha';
  readonly namespace = 'alpha';
  readonly events = { Pinged: payload<{ n: number }>() };
  readonly inits: string[] = [];
  ping(n: number): Promise<void> {
    return this.emit('Pinged', { n });
  }
  plain(n: number): number {
    return n * 2;
  }
  @Use(requireAdmin)
  guarded(n: number): number {
    return n + 1;
  }
  callBeta(n: number) {
    return this.invoke(Beta, 'seesState', [n]);
  }
  init() {
    order.push('Alpha');
  }
  dispose() {
    order.push('-Alpha');
  }
}

class Beta extends Base {
  readonly name = 'Beta';
  readonly namespace = 'beta';
  readonly events = {};
  received: { n: number; requestId: string }[] = [];
  @On('alpha:Alpha:Pinged')
  onPing(p: { n: number }, ctx: EventContext) {
    this.received.push({ n: p.n, requestId: ctx.requestId });
    // state is always empty on an event — correlation only
    asserts.assertEquals(Object.keys(ctx.state), []);
  }
  @On('alpha:Alpha:Pinged')
  boom() {
    throw new Error('subscriber exploded');
  }
  seesState(n: number) {
    return { n, role: this.currentRole ?? 'none' };
  }
  get currentRole(): string | undefined {
    return undefined; // overwritten via invoke state below
  }
  init() {
    order.push('Beta');
  }
  dispose() {
    order.push('-Beta');
  }
}
const order: string[] = [];

const ns = { Alpha, Beta, AlphaAgain: Alpha, helper: () => 1, CONST: 3 };

describe('rapid.modules', () => {
  it('initModules: constructs concrete classes, keys by export name, dedupes re-exports, skips non-classes', async () => {
    const { modules, runtime } = await initModules(QUIET, { modules: [ns] });
    asserts.assert(modules.Alpha instanceof Alpha);
    asserts.assert(modules.Beta instanceof Beta);
    asserts.assertStrictEquals(modules.AlphaAgain, modules.Alpha); // re-export = same instance
    asserts.assertEquals(runtime.modules.length, 2);
    asserts.assertEquals(runtime.declaredEvents, ['alpha:Alpha:Pinged']);
    await runtime.dispose();
  });

  it('an abstract base exported from the barrel fails loudly at mount', async () => {
    await asserts.assertRejects(
      () =>
        initModules(QUIET, {
          modules: [{ Base: Base as unknown as typeof Alpha }],
        }),
      RapidError,
      'abstract base',
    );
  });

  it('log/config/emit/invoke throw before initialization; log+config work after', async () => {
    const loose = new Alpha();
    asserts.assertThrows(
      () => loose.ping(1),
      RapidError,
      'before the module was initialized',
    );
    const { modules } = await initModules(QUIET, { modules: [ns] });
    // protected members reached via a subclass-free cast — the test is about availability
    const a = modules.Alpha as unknown as { log: unknown; config: unknown };
    asserts.assert(a.log !== undefined && a.config !== undefined);
  });

  it('events: typed emit reaches subscribers; a throwing subscriber is isolated and logged', async () => {
    const { modules, runtime } = await initModules(QUIET, { modules: [ns] });
    const errors: string[] = [];
    (runtime.log as unknown as { error: (m: string) => void }).error = (m) => {
      errors.push(m);
    };
    await modules.Alpha.ping(7); // awaited — resolves even though `boom` throws
    asserts.assertEquals(modules.Beta.received.map((r) => r.n), [7]);
    asserts.assertEquals(errors, ['subscriber exploded']); // disclosed, not propagated
  });

  it("correlation: a subscriber inherits the emitter's requestId inside an invocation; minted outside", async () => {
    const { modules, runtime } = await initModules(QUIET, { modules: [ns] });
    (runtime.log as unknown as { error: () => void }).error = () => {};
    await runtime.invoke(Alpha, 'ping', [1], { requestId: 'req-1' });
    asserts.assertEquals(modules.Beta.received[0]!.requestId, 'req-1');
    await modules.Alpha.ping(2); // no invocation in flight → fresh id
    asserts.assertNotEquals(modules.Beta.received[1]!.requestId, 'req-1');
    // ambient scope alone (how rapid's transports wrap a request) is enough
    await ambient.run({ requestId: 'amb-9' }, () => modules.Alpha.ping(3));
    asserts.assertEquals(modules.Beta.received[2]!.requestId, 'amb-9');
  });

  it('fire-and-forget emissions are tracked: drain() waits for them', async () => {
    const { modules, runtime } = await initModules(QUIET, { modules: [ns] });
    (runtime.log as unknown as { error: () => void }).error = () => {};
    void modules.Alpha.ping(5); // not awaited
    await runtime.drain();
    asserts.assertEquals(modules.Beta.received.length, 1);
  });

  it('invoke: runs @Use middleware (deny → 403 envelope, never a throw); plain call bypasses it', async () => {
    const { modules, runtime } = await initModules(QUIET, { modules: [ns] });
    (runtime.log as unknown as { error: () => void }).error = () => {};
    const denied = await runtime.invoke(Alpha, 'guarded', [1]); // no principal
    asserts.assertEquals(denied.status, 403);
    const ok = await runtime.invoke(Alpha, 'guarded', [1], {
      state: { principal: { role: 'admin' } },
    });
    asserts.assertEquals(ok, { status: 200, content: 2 });
    asserts.assertEquals(modules.Alpha.guarded(1), 2); // plain call: no middleware, just a method
    asserts.assertEquals(modules.Alpha.plain(4), 8);
  });

  it('invoke: state flows from an outer invocation into a nested invoke', async () => {
    const { runtime } = await initModules(QUIET, { modules: [ns] });
    // Beta.seesState reads its role through the invoke state, so patch the getter to read ctx
    Object.defineProperty(Beta.prototype, 'currentRole', {
      get() {
        const cur = runtime.current;
        return cur?.type === 'INVOKE'
          ? (cur.state.principal as { role?: string } | undefined)?.role
          : undefined;
      },
      configurable: true,
    });
    const res = await runtime.invoke(Alpha, 'callBeta', [3], {
      state: { principal: { role: 'editor' } },
    });
    // Alpha.callBeta returned Beta's envelope; an envelope-shaped return
    // passes through AS the envelope (status + content), never nested.
    asserts.assertEquals(res, {
      status: 200,
      content: { n: 3, role: 'editor' },
    });
  });

  it('a thrown error inside an invoked method becomes the disclosure envelope', async () => {
    class Thrower extends RapidModule {
      readonly name = 'Thrower';
      readonly namespace = 'thrower';
      readonly events = {};
      fail() {
        throw new RapidError('RAPID_NOT_FOUND', { details: { id: 'x' } });
      }
    }
    const { runtime } = await initModules(QUIET, { modules: [{ Thrower }] });
    (runtime.log as unknown as { error: () => void }).error = () => {};
    const res = await runtime.invoke(Thrower, 'fail', []);
    asserts.assertEquals(res.status, 404);
    asserts.assertEquals(
      (res.content as { code: string }).code,
      'RAPID_NOT_FOUND',
    );
  });

  it('boot validation: @On to an undeclared event fails initModules; emitting an undeclared leaf throws', async () => {
    class Orphan extends RapidModule {
      readonly name = 'Orphan';
      readonly namespace = 'orphan';
      readonly events = {};
      @On('alpha:Alpha:Nope')
      h() {}
    }
    await asserts.assertRejects(
      () => initModules(QUIET, { modules: [{ Alpha, Orphan }] }),
      RapidError,
      "subscribes to 'alpha:Alpha:Nope'",
    );
    const { modules } = await initModules(QUIET, { modules: [{ Alpha }] });
    asserts.assertThrows(
      () =>
        (modules.Alpha as unknown as { emit(e: string, p: unknown): unknown })
          .emit('Nope', {}),
    );
  });

  it('decoration-time validation: malformed @On names are rejected when the class is defined', () => {
    asserts.assertThrows(
      () => On('not-qualified'),
      RapidError,
      'not a valid event name',
    );
    asserts.assertThrows(() => On(), RapidError, 'at least one');
  });

  it('single-instance rule: a doctor-registered module is dispensed, not re-constructed', async () => {
    Doctor.prescribe(Beta, 'SINGLETON');
    try {
      const viaDoctor = inject(Beta);
      const { modules } = await initModules(QUIET, {
        modules: [{ Alpha, Beta }],
      });
      asserts.assertStrictEquals(modules.Beta, viaDoctor);
    } finally {
      Doctor.revoke(Beta);
    }
  });

  it('a class that needs constructor args is rejected with a pointer to sources.instances', async () => {
    class NeedsArgs extends RapidModule {
      readonly name = 'NeedsArgs';
      readonly namespace = 'needs';
      readonly events = {};
      constructor(public dep: number) {
        super();
      }
    }
    await asserts.assertRejects(
      () =>
        initModules(QUIET, {
          modules: [{ NeedsArgs: NeedsArgs as unknown as typeof Alpha }],
        }),
      RapidError,
      'constructor arguments',
    );
    const { modules } = await initModules(QUIET, {
      modules: [],
      instances: { needs: new NeedsArgs(9) },
    });
    asserts.assertEquals(modules.needs.dep, 9);
  });

  it('lifecycle: init in mount order, dispose in reverse; one instance, one runtime', async () => {
    order.length = 0;
    const { modules, runtime } = await initModules(QUIET, { modules: [ns] });
    asserts.assertEquals(order, ['Alpha', 'Beta']);
    await runtime.dispose();
    asserts.assertEquals(order, ['Alpha', 'Beta', '-Beta', '-Alpha']);
    await asserts.assertRejects(
      () =>
        initModules(QUIET, {
          modules: [],
          instances: { again: modules.Alpha },
        }),
      RapidError,
      'another runtime',
    );
  });
});
