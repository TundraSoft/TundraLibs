import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  alwaysOffSampler,
  createRandomIdGenerator,
  extract,
  FLAG_SAMPLED,
  inject,
  MemoryExporter,
  SpanKind,
  SpanStatusCode,
  Tracer,
  TracerConfigError,
} from './mod.ts';
import type { IdGenerator, SpanData, SpanExporter } from './mod.ts';

const tracerWith = (
  options: Partial<ConstructorParameters<typeof Tracer>[0]> = {},
): { tracer: Tracer; exporter: MemoryExporter } => {
  const exporter = new MemoryExporter();
  const tracer = new Tracer({ serviceName: 'test', exporter, ...options });
  return { tracer, exporter };
};

describe('tracer.Tracer', () => {
  describe('configuration', () => {
    it('rejects a missing or empty serviceName', () => {
      for (const serviceName of ['', '   ', undefined, 42]) {
        asserts.assertThrows(
          () => new Tracer({ serviceName } as never),
          TracerConfigError,
          'serviceName',
        );
      }
    });

    it('rejects a non-function sampler', () => {
      asserts.assertThrows(
        () => new Tracer({ serviceName: 'a', sampler: 'nope' as never }),
        TracerConfigError,
        'sampler',
      );
    });

    it('rejects an exporter without an export method', () => {
      for (const exporter of [{}, null, 'nope']) {
        asserts.assertThrows(
          () => new Tracer({ serviceName: 'a', exporter: exporter as never }),
          TracerConfigError,
          'exporter',
        );
      }
    });

    it('rejects an idGenerator that is not a shaped object', () => {
      for (const idGenerator of [null, 'nope', {}, { traceId: () => 'x' }]) {
        asserts.assertThrows(
          () =>
            new Tracer({ serviceName: 'a', idGenerator: idGenerator as never }),
          TracerConfigError,
          'idGenerator',
        );
      }
    });

    it('rejects an idGenerator producing non-conformant ids', () => {
      const cases: IdGenerator[] = [
        { traceId: () => 'too-short', spanId: () => 'b'.repeat(16) },
        { traceId: () => 'A'.repeat(32), spanId: () => 'b'.repeat(16) }, // uppercase
        { traceId: () => '0'.repeat(32), spanId: () => 'b'.repeat(16) }, // all-zero
        { traceId: () => 'a'.repeat(32), spanId: () => 'short' },
        { traceId: () => 'a'.repeat(32), spanId: () => '0'.repeat(16) },
      ];
      for (const idGenerator of cases) {
        asserts.assertThrows(
          () => new Tracer({ serviceName: 'a', idGenerator }),
          TracerConfigError,
          'idGenerator',
        );
      }
    });

    it('accepts a conformant custom idGenerator', () => {
      const idGenerator = createRandomIdGenerator(
        (n) => new Uint8Array(n).fill(0x0a),
      );
      const tracer = new Tracer({ serviceName: 'a', idGenerator });
      asserts.assertEquals(
        tracer.startSpan('s').context.traceId,
        '0a'.repeat(16),
      );
    });

    it('works with no exporter at all', () => {
      const tracer = new Tracer({ serviceName: 'a' });
      const span = tracer.startSpan('s');
      span.end(); // must not throw
      asserts.assertMatch(span.context.traceId, /^[0-9a-f]{32}$/);
    });
  });

  describe('span creation', () => {
    it('starts a root span with a fresh trace and no parent', () => {
      const { tracer } = tracerWith();
      const span = tracer.startSpan('root');
      asserts.assertEquals(span.parentSpanId, undefined);
      asserts.assertMatch(span.context.traceId, /^[0-9a-f]{32}$/);
      asserts.assertEquals(span.kind, SpanKind.INTERNAL);
    });

    it('honours kind, attributes and startTime', () => {
      const { tracer } = tracerWith();
      const span = tracer.startSpan('s', {
        kind: SpanKind.SERVER,
        attributes: { 'http.method': 'GET' },
        startTime: new Date(1234),
      });
      asserts.assertEquals(span.kind, SpanKind.SERVER);
      asserts.assertEquals(span.startTime, new Date(1234));
      asserts.assertEquals(span.toData().attributes['http.method'], 'GET');
    });

    it('attaches service.name and custom resource attributes', () => {
      const { tracer, exporter } = tracerWith({
        resource: { 'deployment.environment': 'ci' },
      });
      tracer.startSpan('s').end();
      const resource = exporter.spans[0]!.resource;
      asserts.assertEquals(resource['service.name'], 'test');
      asserts.assertEquals(resource['deployment.environment'], 'ci');
    });

    it('adopts an explicit parent context', () => {
      const { tracer } = tracerWith();
      const parent = extract({
        traceparent: `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`,
      })!;
      const span = tracer.startSpan('child', { parent });
      asserts.assertEquals(span.context.traceId, 'c'.repeat(32));
      asserts.assertEquals(span.parentSpanId, 'd'.repeat(16));
    });
  });

  describe('automatic parenting', () => {
    it('parents to the active span, across await and depth', async () => {
      const { tracer, exporter } = tracerWith();
      await tracer.startActiveSpan('parent', async () => {
        await new Promise((r) => setTimeout(r, 1));
        await tracer.startActiveSpan('child', async () => {
          await new Promise((r) => setTimeout(r, 1));
          tracer.startSpan('grandchild').end();
        });
      });
      const parent = exporter.find('parent')!;
      const child = exporter.find('child')!;
      const grandchild = exporter.find('grandchild')!;
      asserts.assertEquals(child.parentSpanId, parent.context.spanId);
      asserts.assertEquals(grandchild.parentSpanId, child.context.spanId);
      // One trace throughout.
      asserts.assertEquals(child.context.traceId, parent.context.traceId);
      asserts.assertEquals(grandchild.context.traceId, parent.context.traceId);
    });

    it('parent: null forces a new root even inside an active span', () => {
      const { tracer, exporter } = tracerWith();
      tracer.startActiveSpan('outer', (outer) => {
        tracer.startSpan('detached', { parent: null }).end();
        const detached = exporter.find('detached')!;
        asserts.assertEquals(detached.parentSpanId, undefined);
        asserts.assertNotEquals(
          detached.context.traceId,
          outer.context.traceId,
        );
      });
    });

    it('isolates concurrent traces', async () => {
      const { tracer, exporter } = tracerWith();
      await Promise.all([
        tracer.startActiveSpan('a', async () => {
          await new Promise((r) => setTimeout(r, 5));
          tracer.startSpan('a.child').end();
        }),
        tracer.startActiveSpan('b', async () => {
          await new Promise((r) => setTimeout(r, 1));
          tracer.startSpan('b.child').end();
        }),
      ]);
      asserts.assertEquals(
        exporter.find('a.child')!.parentSpanId,
        exporter.find('a')!.context.spanId,
      );
      asserts.assertEquals(
        exporter.find('b.child')!.parentSpanId,
        exporter.find('b')!.context.spanId,
      );
    });

    it('active() reports the current span and clears afterwards', () => {
      const { tracer } = tracerWith();
      asserts.assertEquals(tracer.active(), undefined);
      tracer.startActiveSpan('s', (span) => {
        asserts.assertStrictEquals(tracer.active(), span);
      });
      asserts.assertEquals(tracer.active(), undefined);
    });
  });

  describe('sampling', () => {
    it('drops unsampled spans but still propagates their context', () => {
      const { tracer, exporter } = tracerWith({ sampler: alwaysOffSampler });
      const span = tracer.startSpan('dropped');
      span.setAttribute('a', 1);
      span.end();
      asserts.assertEquals(exporter.spans.length, 0);
      asserts.assertEquals(span.isRecording(), false);
      asserts.assertEquals(span.context.traceFlags, 0);
      asserts.assertMatch(inject(span.context), /-00$/);
    });

    it('children inherit the parent decision rather than re-sampling', () => {
      let sampplerCalls = 0;
      const { tracer, exporter } = tracerWith({
        sampler: () => {
          sampplerCalls++;
          return true;
        },
      });
      tracer.startActiveSpan('root', () => {
        tracer.startSpan('child').end();
      });
      asserts.assertEquals(sampplerCalls, 1); // root only
      asserts.assertEquals(exporter.spans.length, 2);
    });

    it('inherits an unsampled remote parent', () => {
      const { tracer, exporter } = tracerWith();
      const parent = extract({
        traceparent: `00-${'c'.repeat(32)}-${'d'.repeat(16)}-00`,
      })!;
      tracer.startSpan('child', { parent }).end();
      asserts.assertEquals(exporter.spans.length, 0);
    });

    it('marks sampled spans with the W3C sampled flag', () => {
      const { tracer } = tracerWith();
      asserts.assertEquals(
        tracer.startSpan('s').context.traceFlags,
        FLAG_SAMPLED,
      );
    });
  });

  describe('startActiveSpan', () => {
    it('returns the callback result and ends the span', () => {
      const { tracer, exporter } = tracerWith();
      const result = tracer.startActiveSpan('s', () => 42);
      asserts.assertEquals(result, 42);
      asserts.assertEquals(exporter.spans.length, 1);
    });

    it('accepts options as the second argument', () => {
      const { tracer, exporter } = tracerWith();
      tracer.startActiveSpan('s', { kind: SpanKind.CLIENT }, () => {});
      asserts.assertEquals(exporter.spans[0]!.kind, SpanKind.CLIENT);
    });

    it('awaits an async callback before ending the span', async () => {
      const { tracer, exporter } = tracerWith();
      await tracer.startActiveSpan('s', async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      const span = exporter.spans[0]!;
      asserts.assert(
        span.endTime.getTime() - span.startTime.getTime() >= 9,
        'span duration should cover the awaited work',
      );
    });

    it('records and rethrows a synchronous throw', () => {
      const { tracer, exporter } = tracerWith();
      asserts.assertThrows(
        () =>
          tracer.startActiveSpan('s', () => {
            throw new Error('sync boom');
          }),
        Error,
        'sync boom',
      );
      const span = exporter.spans[0]!;
      asserts.assertEquals(span.events[0]!.name, 'exception');
      asserts.assertEquals(
        span.events[0]!.attributes['exception.message'],
        'sync boom',
      );
    });

    it('records and rethrows an async rejection', async () => {
      const { tracer, exporter } = tracerWith();
      await asserts.assertRejects(
        () =>
          tracer.startActiveSpan('s', async () => {
            await new Promise((r) => setTimeout(r, 1));
            throw new Error('async boom');
          }),
        Error,
        'async boom',
      );
      asserts.assertEquals(
        exporter.spans[0]!.events[0]!.attributes['exception.message'],
        'async boom',
      );
    });
  });

  describe('export resilience', () => {
    it('swallows a rejected export', async () => {
      const exporter: SpanExporter = {
        export: () => Promise.reject(new Error('collector down')),
      };
      const tracer = new Tracer({ serviceName: 'test', exporter });
      tracer.startSpan('s').end(); // must not throw or reject
      await tracer.shutdown();
    });

    it('swallows a synchronous throw from a broken exporter', () => {
      const exporter = {
        export: () => {
          throw new Error('broken');
        },
      } as unknown as SpanExporter;
      const tracer = new Tracer({ serviceName: 'test', exporter });
      tracer.startSpan('s').end(); // must not throw
    });

    it('shutdown awaits in-flight exports and calls exporter.shutdown', async () => {
      let flushed = false;
      let exported: SpanData[] = [];
      const exporter: SpanExporter = {
        export: async (spans) => {
          await new Promise((r) => setTimeout(r, 5));
          exported = spans;
        },
        shutdown: () => {
          flushed = true;
          return Promise.resolve();
        },
      };
      const tracer = new Tracer({ serviceName: 'test', exporter });
      tracer.startSpan('s').end();
      await tracer.shutdown();
      asserts.assertEquals(exported.length, 1);
      asserts.assertEquals(flushed, true);
    });

    it('shutdown is safe with no exporter', async () => {
      const tracer = new Tracer({ serviceName: 'test' });
      await tracer.shutdown();
    });
  });

  describe('end-to-end propagation', () => {
    it('continues a trace across a simulated service boundary', () => {
      const a = tracerWith();
      const b = tracerWith();

      let header = '';
      a.tracer.startActiveSpan('client', { kind: SpanKind.CLIENT }, (span) => {
        header = inject(span.context);
      });

      // …the header travels over the wire…
      const parent = extract({ traceparent: header });
      b.tracer.startActiveSpan(
        'server',
        { kind: SpanKind.SERVER, parent },
        (span) => {
          span.setStatus(SpanStatusCode.OK);
        },
      );

      const client = a.exporter.find('client')!;
      const server = b.exporter.find('server')!;
      asserts.assertEquals(server.context.traceId, client.context.traceId);
      asserts.assertEquals(server.parentSpanId, client.context.spanId);
    });
  });
});

describe('tracer.adapters', () => {
  describe('wrap (the Witness adapter)', () => {
    it('runs fn inside an active span with the given name and attributes', async () => {
      const { tracer, exporter } = tracerWith();
      const result = await tracer.wrap(
        { name: 'norm.Users.find', attributes: { 'norm.entity': 'Users' } },
        async () => {
          // Auto-parenting must hold inside the wrapped fn.
          tracer.startSpan('child').end();
          return 42;
        },
      );
      asserts.assertEquals(result, 42);
      const op = exporter.find('norm.Users.find')!;
      asserts.assertEquals(op.attributes['norm.entity'], 'Users');
      asserts.assertEquals(
        exporter.find('child')!.parentSpanId,
        op.context.spanId,
      );
    });

    it('drops attribute values OTLP cannot represent', async () => {
      const { tracer, exporter } = tracerWith();
      await tracer.wrap({
        name: 'op',
        attributes: {
          ok: 'yes',
          n: 1,
          list: ['a', 'b'],
          nested: { not: 'representable' },
          mixed: ['a', { b: 1 }],
        },
      }, () => Promise.resolve());
      const attrs = exporter.find('op')!.attributes;
      asserts.assertEquals(attrs.ok, 'yes');
      asserts.assertEquals(attrs.n, 1);
      asserts.assertEquals(attrs.list, ['a', 'b']);
      asserts.assertEquals('nested' in attrs, false);
      asserts.assertEquals('mixed' in attrs, false);
    });

    it('records and rethrows errors (witness contract)', async () => {
      const { tracer, exporter } = tracerWith();
      await asserts.assertRejects(
        () =>
          tracer.wrap({ name: 'boom' }, () => {
            return Promise.reject(new Error('op failed'));
          }),
        Error,
        'op failed',
      );
      asserts.assertEquals(
        exporter.find('boom')!.events[0]!.attributes['exception.message'],
        'op failed',
      );
    });

    it('works detached, as norm receives it', async () => {
      const { tracer, exporter } = tracerWith();
      const witness = tracer.wrap; // detached — must stay bound
      await witness({ name: 'detached' }, () => Promise.resolve('ok'));
      asserts.assertEquals(exporter.find('detached')!.name, 'detached');
    });
  });

  describe('logContext (the contextProvider adapter)', () => {
    it('returns {} outside any span', () => {
      const { tracer } = tracerWith();
      asserts.assertEquals(tracer.logContext(), {});
    });

    it('returns the CANONICAL camelCase keys inside a span', () => {
      const { tracer } = tracerWith();
      tracer.startActiveSpan('op', (span) => {
        // traceId/spanId exactly — otelLogFormatter's hoisting defaults.
        asserts.assertEquals(tracer.logContext(), {
          traceId: span.context.traceId,
          spanId: span.context.spanId,
        });
      });
    });

    it('still reports ids for unsampled spans (correlation without export)', () => {
      const { tracer } = tracerWith({ sampler: alwaysOffSampler });
      tracer.startActiveSpan('dropped', (span) => {
        asserts.assertEquals(
          (tracer.logContext() as { traceId?: string }).traceId,
          span.context.traceId,
        );
      });
    });

    it('works detached, as slogger receives it', () => {
      const { tracer } = tracerWith();
      const provider = tracer.logContext; // detached — must stay bound
      tracer.startActiveSpan('op', () => {
        asserts.assert('traceId' in provider());
      });
      asserts.assertEquals(provider(), {});
    });
  });
});
