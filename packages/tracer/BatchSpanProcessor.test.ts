import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  BatchSpanProcessor,
  MemoryExporter,
  SpanKind,
  SpanStatusCode,
  Tracer,
} from './mod.ts';
import type { SpanData, SpanExporter } from './mod.ts';

const spanData = (name = 'op'): SpanData => ({
  name,
  context: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 },
  kind: SpanKind.INTERNAL,
  startTime: new Date(1000),
  endTime: new Date(1100),
  attributes: {},
  events: [],
  status: { code: SpanStatusCode.UNSET },
  resource: { 'service.name': 'test' },
});

/** Records the size of each batch it receives. */
const countingExporter = () => {
  const batches: number[] = [];
  const exporter: SpanExporter = {
    export: (spans) => {
      batches.push(spans.length);
      return Promise.resolve();
    },
  };
  return { exporter, batches };
};

describe('tracer.BatchSpanProcessor', () => {
  it('buffers instead of exporting immediately', () => {
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 60_000 });
    bsp.export([spanData()]);
    asserts.assertEquals(batches, []); // still queued
  });

  it('flushes as soon as the batch size is reached', () => {
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, {
      maxExportBatchSize: 3,
      scheduledDelayMs: 60_000,
    });
    bsp.export([spanData(), spanData()]);
    asserts.assertEquals(batches, []);
    bsp.export([spanData()]); // third — trips the threshold
    asserts.assertEquals(batches, [3]);
  });

  it('reuses the pending timer instead of arming a second one', async () => {
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 30 });
    bsp.export([spanData('1')]); // arms the timer
    bsp.export([spanData('2')]); // must NOT arm a second one
    await new Promise((r) => setTimeout(r, 80));
    // One timer, therefore one flush carrying both spans — two timers would
    // have produced two exports.
    asserts.assertEquals(batches, [2]);
  });

  it('flushes a partial batch on the timer', async () => {
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 20 });
    bsp.export([spanData()]);
    asserts.assertEquals(batches, []);
    await new Promise((r) => setTimeout(r, 60));
    asserts.assertEquals(batches, [1]);
  });

  it('forceFlush exports everything queued and awaits it', async () => {
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 60_000 });
    bsp.export([spanData(), spanData()]);
    await bsp.forceFlush();
    asserts.assertEquals(batches, [2]);
  });

  it('splits an oversized queue into batch-sized exports', async () => {
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, {
      maxExportBatchSize: 2,
      scheduledDelayMs: 60_000,
    });
    bsp.export([spanData(), spanData(), spanData(), spanData(), spanData()]);
    await bsp.forceFlush();
    asserts.assertEquals(batches.reduce((a, b) => a + b, 0), 5);
    asserts.assert(batches.every((n) => n <= 2), 'no batch exceeds the size');
  });

  it('drops the OLDEST spans on overflow and reports the count', async () => {
    const dropped: number[] = [];
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, {
      maxQueueSize: 3,
      maxExportBatchSize: 100, // never trips on size
      scheduledDelayMs: 60_000,
      onDrop: (n) => dropped.push(n),
    });
    bsp.export([spanData('1'), spanData('2'), spanData('3'), spanData('4')]);
    asserts.assertEquals(dropped, [1]);
    await bsp.forceFlush();
    asserts.assertEquals(batches, [3]); // queue was capped at 3
  });

  it('shutdown flushes, awaits, and shuts the wrapped exporter down', async () => {
    let shutdownCalled = false;
    const seen: SpanData[] = [];
    const exporter: SpanExporter = {
      export: async (spans) => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(...spans);
      },
      shutdown: () => {
        shutdownCalled = true;
        return Promise.resolve();
      },
    };
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 60_000 });
    bsp.export([spanData(), spanData()]);
    await bsp.shutdown();
    asserts.assertEquals(seen.length, 2);
    asserts.assertEquals(shutdownCalled, true);
  });

  it('drops spans queued after shutdown', async () => {
    const { exporter, batches } = countingExporter();
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 60_000 });
    await bsp.shutdown();
    bsp.export([spanData()]);
    await bsp.forceFlush();
    asserts.assertEquals(batches, []);
  });

  it('survives an exporter that rejects', async () => {
    const exporter: SpanExporter = {
      export: () => Promise.reject(new Error('collector down')),
    };
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 60_000 });
    bsp.export([spanData()]);
    await bsp.forceFlush(); // must not reject
    await bsp.shutdown();
  });

  it('survives an exporter that throws synchronously', async () => {
    const exporter = {
      export: () => {
        throw new Error('broken');
      },
    } as unknown as SpanExporter;
    const bsp = new BatchSpanProcessor(exporter, { scheduledDelayMs: 60_000 });
    bsp.export([spanData()]);
    await bsp.forceFlush(); // must not throw
  });

  it('drops straight into Tracer as an exporter', async () => {
    const memory = new MemoryExporter();
    const bsp = new BatchSpanProcessor(memory, { scheduledDelayMs: 60_000 });
    const tracer = new Tracer({ serviceName: 'test', exporter: bsp });

    tracer.startActiveSpan('work', () => {});
    asserts.assertEquals(memory.spans.length, 0); // buffered, not exported

    await bsp.forceFlush();
    asserts.assertEquals(memory.spans.length, 1);
    asserts.assertEquals(memory.spans[0]!.name, 'work');
  });
});
