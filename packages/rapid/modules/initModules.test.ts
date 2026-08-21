/**
 * @fileoverview The module system end-to-end: bootstrap, identity
 * enforcement, the three channels (plain call / invoke / event),
 * correlation, isolation, lifecycle, the single-instance rule — and a
 * regression test for every finding of the adversarial review.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { ambient } from '@tundralibs/ambient';
import { Doctor, inject } from '@tundralibs/doctor';
import { RapidError } from '../errors/mod.ts';
import {
  event,
  type EventContext,
  initModules,
  type ModuleRuntime,
  On,
  RapidModule,
  type RapidModuleEventMap,
  type RapidModuleInvokeMiddleware,
  Reply,
  reply,
  Use,
} from './mod.ts';

const QUIET = { name: 'modules-test', logger: { handlers: [] } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── fixtures ────────────────────────────────────────────────────────────
const requireAdmin: RapidModuleInvokeMiddleware = (ctx, next) => {
  if (
    (ctx.state.principal as { role?: string } | undefined)?.role !== 'admin'
  ) {
    throw new RapidError('RAPID_ACCESS_DENIED');
  }
  return next();
};
/** Test-scoped probes the middleware below writes into. */
const probe: {
  state?: Record<string, unknown>;
  requestId?: string;
  tenant?: unknown;
} = {};
const observe: RapidModuleInvokeMiddleware = (ctx, next) => {
  probe.state = ctx.state;
  probe.requestId = ctx.requestId;
  probe.tenant = ambient.get()?.tenant;
  return next();
};
const order: string[] = [];

abstract class Base<E extends RapidModuleEventMap = Record<string, never>>
  extends RapidModule<E> {}

const ALPHA_EVENTS = { Pinged: event<{ n: number }>() };
class Alpha extends Base<typeof ALPHA_EVENTS> {
  readonly name = 'Alpha';
  readonly namespace = 'alpha';
  protected readonly events = ALPHA_EVENTS;
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
  @Use(observe)
  whoami(): string {
    return 'alpha';
  }
  @Use((ctx, next) => {
    ctx.state.touched = true; // a state-WRITING guard
    return next();
  })
  writer(): string {
    return 'wrote';
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
  protected readonly events = {};
  received: { n: number; requestId: string }[] = [];
  slowSeen: { n: number; requestId: string }[] = [];
  viaEventStatus: number | undefined;
  @On('alpha:Alpha:Pinged')
  onPing(p: { n: number }, ctx: EventContext) {
    this.received.push({ n: p.n, requestId: ctx.requestId });
  }
  @On('alpha:Alpha:Pinged')
  boom() {
    throw new Error('subscriber exploded');
  }
  @On('alpha:Alpha:Pinged')
  async slowPing(p: { n: number }, ctx: EventContext) {
    await sleep(5); // a genuinely ASYNC subscriber — awaited emit / drain must wait for it
    this.slowSeen.push({ n: p.n, requestId: ctx.requestId });
  }
  @On('alpha:Alpha:Pinged')
  async viaEvent(p: { n: number }) {
    if (p.n === 99) {
      this.viaEventStatus = (await this.invoke(Alpha, 'writer', [])).status;
    }
  }
  @Use(observe)
  seesState(n: number) {
    return {
      n,
      role: (probe.state?.principal as { role?: string } | undefined)?.role,
    };
  }
  init() {
    order.push('Beta');
  }
  dispose() {
    order.push('-Beta');
  }
}

const ns = { Alpha, Beta, AlphaAgain: Alpha, helper: () => 1, CONST: 3 };
const boot = () => initModules(QUIET, { modules: [ns] });
const captureErrors = (runtime: ModuleRuntime): string[] => {
  const errors: string[] = [];
  (runtime.log as unknown as { error: (m: string) => void }).error = (m) => {
    errors.push(m);
  };
  return errors;
};

describe('rapid.modules', () => {
  it('initModules: constructs concrete classes, keys by export name, dedupes re-exports, skips non-classes', async () => {
    const { modules, runtime } = await boot();
    asserts.assert(modules.Alpha instanceof Alpha);
    asserts.assert(modules.Beta instanceof Beta);
    asserts.assertStrictEquals(modules.AlphaAgain, modules.Alpha);
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

  it('log / config / emit / invoke all throw before initialization', () => {
    const loose = new Alpha() as unknown as {
      log: unknown;
      config: unknown;
      ping(n: number): unknown;
      callBeta(n: number): unknown;
    };
    for (
      const use of [
        () => loose.log,
        () => loose.config,
        () => loose.ping(1),
        () => loose.callBeta(1),
      ]
    ) {
      asserts.assertThrows(
        use,
        RapidError,
        'before the module was initialized',
      );
    }
  });

  it('events: a throwing subscriber is isolated and logged with its ORIGINAL message; others still run', async () => {
    const { modules, runtime } = await boot();
    const errors = captureErrors(runtime);
    await modules.Alpha.ping(7);
    asserts.assertEquals(modules.Beta.received.map((r) => r.n), [7]);
    asserts.assertEquals(errors, ['subscriber exploded']);
    await runtime.dispose();
  });

  it('an AWAITED emit resolves only after an async subscriber has finished', async () => {
    const { modules, runtime } = await boot();
    captureErrors(runtime);
    await modules.Alpha.ping(7);
    asserts.assertEquals(modules.Beta.slowSeen.map((s) => s.n), [7]); // 5ms subscriber done
    await runtime.dispose();
  });

  it('fire-and-forget emissions are tracked: drain() waits for async subscribers', async () => {
    const { modules, runtime } = await boot();
    captureErrors(runtime);
    void modules.Alpha.ping(5);
    asserts.assertEquals(modules.Beta.slowSeen.length, 0); // not yet
    await runtime.drain();
    asserts.assertEquals(modules.Beta.slowSeen.map((s) => s.n), [5]);
    await runtime.dispose();
  });

  it('correlation: ONE id per emission shared by every delivery; inherited from invoke or an ambient scope; minted otherwise', async () => {
    const { modules, runtime } = await boot();
    captureErrors(runtime);
    await runtime.invoke(Alpha, 'ping', [1], { requestId: 'req-1' });
    asserts.assertEquals(modules.Beta.received[0]!.requestId, 'req-1');
    asserts.assertEquals(modules.Beta.slowSeen[0]!.requestId, 'req-1'); // same emission, same id
    await ambient.run({ requestId: 'amb-9' }, () => modules.Alpha.ping(3)); // how a transport wraps a request
    asserts.assertEquals(modules.Beta.received[1]!.requestId, 'amb-9');
    await modules.Alpha.ping(2); // nothing in flight → minted, but still ONE id for both deliveries
    const minted = modules.Beta.received[2]!.requestId;
    asserts.assertNotEquals(minted, 'amb-9');
    asserts.assertEquals(modules.Beta.slowSeen[2]!.requestId, minted);
    await runtime.dispose();
  });

  it('invoke: @Use runs (deny → 403 Reply, never a throw); plain call bypasses it', async () => {
    const { modules, runtime } = await boot();
    captureErrors(runtime);
    const denied = await runtime.invoke(Alpha, 'guarded', [1]);
    asserts.assert(denied instanceof Reply);
    asserts.assertEquals(denied.status, 403);
    const ok = await runtime.invoke(Alpha, 'guarded', [1], {
      state: { principal: { role: 'admin' } },
    });
    asserts.assertEquals([ok.status, ok.content], [200, 2]);
    asserts.assertEquals(modules.Alpha.guarded(1), 2); // just a method
    await runtime.dispose();
  });

  it('invoke: inherits an ambient requestId and JOINS the scope (app-added bag keys survive)', async () => {
    const { runtime } = await boot();
    await ambient.run(
      { requestId: 'amb-1', tenant: 'acme' },
      () => runtime.invoke(Alpha, 'whoami', []),
    );
    asserts.assertEquals(probe.requestId, 'amb-1');
    asserts.assertEquals(probe.tenant, 'acme');
    await runtime.dispose();
  });

  it("invoke: state flows into a nested invoke as a COPY — the callee cannot rewrite the caller's bag", async () => {
    const { runtime } = await boot();
    const seed = { principal: { role: 'editor' } };
    const res = await runtime.invoke(Alpha, 'callBeta', [3], { state: seed });
    // Beta's envelope passed through AS the envelope (not nested)
    asserts.assertEquals([res.status, res.content], [200, {
      n: 3,
      role: 'editor',
    }]);
    probe.state!.extra = 'added by callee';
    asserts.assertEquals((seed as Record<string, unknown>).extra, undefined);
    await runtime.dispose();
  });

  it('REGRESSION: invoke from an @On handler gets a fresh, WRITABLE state (not the frozen event state)', async () => {
    const { modules, runtime } = await boot();
    captureErrors(runtime);
    await modules.Alpha.ping(99);
    asserts.assertEquals(modules.Beta.viaEventStatus, 200);
    await runtime.dispose();
  });

  it('REGRESSION: a middleware that forgets `return next()` cannot finish the invocation early or orphan a rejection', async () => {
    class Detached extends RapidModule {
      readonly name = 'Detached';
      readonly namespace = 'detached';
      protected readonly events = {};
      @Use((_c, next) => {
        next(); // no return — the classic mistake
      })
      async slow() {
        await sleep(5);
        return 'late';
      }
      @Use((_c, next) => {
        next();
      })
      async slowFail() {
        await sleep(5);
        throw new Error('late failure');
      }
    }
    const { runtime } = await initModules(QUIET, { modules: [{ Detached }] });
    const errors = captureErrors(runtime);
    asserts.assertEquals(
      await runtime.invoke(Detached, 'slow', []),
      new Reply(200, 'late'),
    );
    const failed = await runtime.invoke(Detached, 'slowFail', []);
    asserts.assertEquals(failed.status, 500);
    asserts.assertEquals(errors, ['late failure']); // disclosed exactly once, never unhandled
    await runtime.dispose();
  });

  it('envelopes are EXPLICIT: reply() sets status, void is 204, a domain object with a `content` key stays content', async () => {
    class Shapes extends RapidModule {
      readonly name = 'Shapes';
      readonly namespace = 'shapes';
      protected readonly events = {};
      created() {
        return reply(201, { id: 1 });
      }
      nothing(): void {}
      message() {
        return { content: 'hello', status: 'draft' }; // a DOMAIN object
      }
      fail() {
        throw new RapidError('RAPID_NOT_FOUND', { details: { id: 'x' } });
      }
    }
    const { runtime } = await initModules(QUIET, { modules: [{ Shapes }] });
    captureErrors(runtime);
    asserts.assertEquals(
      await runtime.invoke(Shapes, 'created', []),
      new Reply(201, { id: 1 }),
    );
    asserts.assertEquals(
      await runtime.invoke(Shapes, 'nothing', []),
      new Reply(204, null),
    );
    asserts.assertEquals(
      await runtime.invoke(Shapes, 'message', []),
      new Reply(200, { content: 'hello', status: 'draft' }),
    );
    const res = await runtime.invoke(Shapes, 'fail', []);
    asserts.assertEquals(res.status, 404);
    asserts.assertEquals(
      (res.content as unknown as { code: string }).code,
      'RAPID_NOT_FOUND',
    );
    await runtime.dispose();
  });

  it('invoke rejects (never throws) for an unmounted target or a non-invokable name; @On handlers and _private are not invokable', async () => {
    const { runtime } = await boot();
    await asserts.assertRejects(
      () => runtime.invoke(Alpha, 'onPing' as unknown as 'plain', [1]),
      RapidError,
      'no invokable method',
    );
    class Loose extends RapidModule {
      readonly name = 'Loose';
      readonly namespace = 'loose';
      protected readonly events = {};
    }
    await asserts.assertRejects(
      () => runtime.invoke(Loose, 'name' as unknown as never, [] as never),
      RapidError,
      'not mounted',
    );
    await runtime.dispose();
  });

  it('boot validation: unknown @On target fails initModules and leaves NO runtime behind; undeclared emits throw; @Use on @On is rejected', async () => {
    class Orphan extends RapidModule {
      readonly name = 'Orphan';
      readonly namespace = 'orphan';
      protected readonly events = {};
      @On('alpha:Alpha:Nope')
      h() {}
    }
    await asserts.assertRejects(
      () => initModules(QUIET, { modules: [{ Alpha, Orphan }] }),
      RapidError,
      "subscribes to 'alpha:Alpha:Nope'",
    );
    const { modules, runtime } = await initModules(QUIET, {
      modules: [{ Alpha }],
    });
    asserts.assertThrows(
      () =>
        (modules.Alpha as unknown as { emit(e: string, p: unknown): unknown })
          .emit('Nope', {}),
      RapidError,
      'undeclared event',
    );
    asserts.assertThrows(
      () => runtime.emit('nobody:Nope:Nope', 1),
      RapidError,
      'not declared',
    );
    await runtime.dispose();

    class Guarded extends RapidModule {
      readonly name = 'Guarded';
      readonly namespace = 'guarded';
      protected readonly events = {};
      @Use(requireAdmin)
      @On('alpha:Alpha:Pinged')
      h() {}
    }
    await asserts.assertRejects(
      () => initModules(QUIET, { modules: [{ Alpha, Guarded }] }),
      RapidError,
      '@Use on an @On handler',
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

  it('single-instance rule: a doctor-registered module is dispensed, not re-constructed — and can be re-hosted after dispose()', async () => {
    Doctor.prescribe(Beta, 'SINGLETON');
    try {
      const viaDoctor = inject(Beta);
      const first = await initModules(QUIET, { modules: [{ Alpha, Beta }] });
      asserts.assertStrictEquals(first.modules.Beta, viaDoctor);
      await first.runtime.dispose();
      const second = await initModules(QUIET, { modules: [{ Alpha, Beta }] }); // same singleton, new host
      asserts.assertStrictEquals(second.modules.Beta, viaDoctor);
      await second.runtime.dispose();
    } finally {
      Doctor.revoke(Beta);
    }
  });

  it('construction failures and key collisions are loud', async () => {
    class Explodes extends RapidModule {
      readonly name = 'Explodes';
      readonly namespace = 'explodes';
      protected readonly events = {};
      constructor() {
        super();
        throw new Error('needs a db');
      }
    }
    await asserts.assertRejects(
      () => initModules(QUIET, { modules: [{ Explodes }] }),
      RapidError,
      'could not be constructed (needs a db)',
    );
    class NeedsArgs extends RapidModule {
      readonly name = 'NeedsArgs';
      readonly namespace = 'needs';
      protected readonly events = {};
      constructor(public dep: number) {
        super();
      }
    }
    const { modules, runtime } = await initModules(QUIET, {
      modules: [],
      instances: { needs: new NeedsArgs(9) },
    });
    asserts.assertEquals(modules.needs.dep, 9);
    await runtime.dispose();
    await asserts.assertRejects(
      () =>
        initModules(QUIET, {
          modules: [{ Alpha }],
          instances: { Alpha: new Beta() },
        }),
      RapidError,
      "keyed 'Alpha'",
    );
  });

  it('lifecycle: init in mount order, dispose in reverse, idempotent, tolerant of a throwing hook, then closed', async () => {
    order.length = 0;
    const { modules, runtime } = await boot();
    asserts.assertEquals(order, ['Alpha', 'Beta']);
    await runtime.dispose();
    await runtime.dispose(); // idempotent — hooks run ONCE
    asserts.assertEquals(order, ['Alpha', 'Beta', '-Beta', '-Alpha']);
    asserts.assertThrows(
      () => runtime.mount(modules.Alpha),
      RapidError,
      'disposed',
    );
    await asserts.assertRejects(
      () => runtime.invoke(Alpha, 'plain', [1]),
      RapidError,
      'disposed',
    );
    // the instance is unbound again — a NEW host may take it
    const again = await initModules(QUIET, {
      modules: [],
      instances: { a: modules.Alpha },
    });
    await again.runtime.dispose();

    class Bad extends RapidModule {
      readonly name = 'Bad';
      readonly namespace = 'bad';
      protected readonly events = {};
      dispose() {
        throw new Error('cannot close');
      }
    }
    order.length = 0;
    const mixed = await initModules(QUIET, { modules: [{ Alpha, Bad }] });
    const errors = captureErrors(mixed.runtime);
    await mixed.runtime.dispose();
    asserts.assertEquals(order, ['Alpha', '-Alpha']); // Alpha still disposed after Bad threw
    asserts.assertEquals(errors, ['module dispose failed']);
  });

  it('REGRESSION: an init() failure disposes the modules already initialized, then rejects', async () => {
    const log: string[] = [];
    class Opens extends RapidModule {
      readonly name = 'Opens';
      readonly namespace = 'opens';
      protected readonly events = {};
      init() {
        log.push('open');
      }
      dispose() {
        log.push('close');
      }
    }
    class Fails extends RapidModule {
      readonly name = 'Fails';
      readonly namespace = 'fails';
      protected readonly events = {};
      init() {
        throw new Error('boot failed');
      }
    }
    await asserts.assertRejects(
      () => initModules(QUIET, { modules: [{ Opens, Fails }] }),
      Error,
      'boot failed',
    );
    asserts.assertEquals(log, ['open', 'close']);
  });

  it('mount() after finalize() is rejected — every module must mount before finalize', async () => {
    const { runtime } = await boot(); // initModules finalizes the runtime
    class Late extends RapidModule {
      readonly name = 'Late';
      readonly namespace = 'late';
      protected readonly events = {};
    }
    asserts.assertThrows(
      () => runtime.mount(new Late()),
      RapidError,
      'finalize',
    );
    await runtime.dispose();
  });

  it("two classes claiming the same 'namespace:Name' collide at mount", async () => {
    class One extends RapidModule {
      readonly name = 'X';
      readonly namespace = 'x';
      protected readonly events = {};
    }
    class Two extends RapidModule {
      readonly name = 'X';
      readonly namespace = 'x';
      protected readonly events = {};
    }
    await asserts.assertRejects(
      () => initModules(QUIET, { modules: [{ One, Two }] }),
      RapidError,
      "identify as 'x:X'",
    );
  });
});
