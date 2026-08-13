import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { type Context, createContext } from '@tundralibs/ambient';
import { activeSpan, buildActiveSpan } from './activeSpan.ts';
import { FLAG_SAMPLED, MemoryExporter, Span, SpanKind, Tracer } from './mod.ts';

/** A standalone {@link Span}, built without a {@link Tracer}. */
const spanNamed = (name: string, spanId = '1'.repeat(16)): Span =>
  new Span({
    name,
    context: {
      traceId: 'a'.repeat(32),
      spanId,
      traceFlags: FLAG_SAMPLED,
    },
    kind: SpanKind.INTERNAL,
    startTime: new Date(),
    resource: {},
    recording: true,
    onEnd: () => {},
  });

describe('tracer.activeSpan', () => {
  it('is empty outside any run scope', () => {
    asserts.assertEquals(activeSpan.get(), undefined);
    asserts.assertEquals(activeSpan.active(), false);
  });

  it('getOr falls back outside any run scope', () => {
    const fallback = spanNamed('fallback');
    asserts.assertStrictEquals(activeSpan.getOr(fallback), fallback);
  });

  it('exposes the span inside run', () => {
    const span = spanNamed('root');
    activeSpan.run(span, () => {
      asserts.assertStrictEquals(activeSpan.get(), span);
      asserts.assertStrictEquals(activeSpan.getOr(spanNamed('other')), span);
      asserts.assertEquals(activeSpan.active(), true);
    });
    asserts.assertEquals(activeSpan.get(), undefined);
  });

  it('survives await', async () => {
    const span = spanNamed('async');
    await activeSpan.run(span, async () => {
      await new Promise((r) => setTimeout(r, 1));
      asserts.assertStrictEquals(activeSpan.get(), span);
    });
  });

  it('nests — the inner scope wins, the outer is restored', () => {
    const outer = spanNamed('outer', '1'.repeat(16));
    const inner = spanNamed('inner', '2'.repeat(16));
    activeSpan.run(outer, () => {
      activeSpan.run(inner, () => {
        asserts.assertStrictEquals(activeSpan.get(), inner);
      });
      asserts.assertStrictEquals(activeSpan.get(), outer);
    });
  });

  it('isolates concurrent flows', async () => {
    const seen: Array<string | undefined> = [];
    const flow = (name: string, delay: number) =>
      activeSpan.run(spanNamed(name), async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push(activeSpan.get()?.name);
      });
    await Promise.all([flow('f1', 5), flow('f2', 1)]);
    asserts.assertArrayIncludes(seen, ['f1', 'f2']);
  });

  describe('one shared store, built on first use', () => {
    // The store is created lazily, so what has to be proven is that every
    // entry point still lands on the SAME instance — a second store would not
    // observe the first's writes, and spans would silently stop nesting.

    it('a Tracer reads the span this module put in scope', () => {
      const tracer = new Tracer({ serviceName: 'shared' });
      const span = spanNamed('from-store');
      activeSpan.run(span, () => {
        // `tracer.active()` is a different entry into the same store.
        asserts.assertStrictEquals(tracer.active(), span);
        asserts.assertEquals(tracer.logContext(), {
          traceId: span.context.traceId,
          spanId: span.context.spanId,
        });
      });
    });

    it('this module reads the span a Tracer put in scope', () => {
      const tracer = new Tracer({ serviceName: 'shared' });
      tracer.startActiveSpan('work', (span) => {
        asserts.assertStrictEquals(activeSpan.get(), span);
        asserts.assertEquals(activeSpan.active(), true);
      });
      asserts.assertEquals(activeSpan.get(), undefined);
    });

    it('spans still nest across an await, at depth', async () => {
      const exporter = new MemoryExporter();
      const tracer = new Tracer({ serviceName: 'nesting', exporter });
      await tracer.startActiveSpan('outer', async () => {
        await new Promise((r) => setTimeout(r, 1));
        // Started five frames deep and after an await — it must still find
        // `outer` through the shared store.
        await tracer.startActiveSpan('inner', async () => {
          await new Promise((r) => setTimeout(r, 1));
        });
      });
      const outer = exporter.find('outer')!;
      const inner = exporter.find('inner')!;
      asserts.assertEquals(inner.parentSpanId, outer.context.spanId);
      asserts.assertEquals(inner.context.traceId, outer.context.traceId);
      asserts.assertEquals(outer.parentSpanId, undefined);
    });
  });
});

describe('tracer.activeSpan (runtime without AsyncLocalStorage)', () => {
  /**
   * Stands in for a browser: the store can never be built. `createContext`
   * raises exactly this on such a runtime, so the surface is exercised against
   * the failure it actually degrades around.
   */
  const noAsyncLocalStorage = new TypeError(
    "@tundralibs/ambient requires 'AsyncLocalStorage' (node:async_hooks), " +
      'which this runtime does not provide.',
  );
  const degraded = buildActiveSpan((): never => {
    throw noAsyncLocalStorage;
  });

  it('get() returns undefined instead of throwing', () => {
    asserts.assertEquals(degraded.get(), undefined);
  });

  it('getOr() returns the fallback instead of throwing', () => {
    const fallback = spanNamed('fallback');
    asserts.assertStrictEquals(degraded.getOr(fallback), fallback);
  });

  it('active() reports false instead of throwing', () => {
    asserts.assertEquals(degraded.active(), false);
  });

  it('run() propagates the store error unchanged', () => {
    const thrown = asserts.assertThrows(
      () => degraded.run(spanNamed('never'), () => 'never'),
      TypeError,
      'AsyncLocalStorage',
    );
    asserts.assertStrictEquals(thrown, noAsyncLocalStorage);
  });

  it('run() does not run the callback when it throws', () => {
    let ran = false;
    asserts.assertThrows(() =>
      degraded.run(spanNamed('never'), () => {
        ran = true;
      })
    );
    // Failing loudly is the point: silently running `fn` with no active span
    // would produce orphaned root spans instead of a nested trace.
    asserts.assertEquals(ran, false);
  });

  it('works normally again once the resolver supplies a store', () => {
    // The seam is honoured in the working direction too, so the degradation
    // above is genuinely driven by store availability and not by the seam
    // itself being broken.
    const store: Context<Span> = createContext<Span>();
    const working = buildActiveSpan(() => store);
    const span = spanNamed('w1');
    working.run(span, () => {
      asserts.assertStrictEquals(working.get(), span);
      asserts.assertStrictEquals(working.getOr(spanNamed('other')), span);
      asserts.assertEquals(working.active(), true);
    });
    asserts.assertEquals(working.get(), undefined);
    asserts.assertEquals(working.active(), false);
  });
});
