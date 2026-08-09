import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { ConsoleExporter, MemoryExporter } from './mod.ts';
import { SpanKind, SpanStatusCode } from '../types/mod.ts';
import type { SpanData } from '../types/mod.ts';

const spanData = (overrides: Partial<SpanData> = {}): SpanData => ({
  name: 'op',
  context: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 },
  kind: SpanKind.INTERNAL,
  startTime: new Date(1000),
  endTime: new Date(1250),
  attributes: {},
  events: [],
  status: { code: SpanStatusCode.UNSET },
  resource: { 'service.name': 'test' },
  ...overrides,
});

/** Capture console.log for the duration of `fn`. */
const captureLog = async (fn: () => void | Promise<void>) => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
};

describe('tracer.exporters', () => {
  describe('MemoryExporter', () => {
    it('buffers spans in completion order', async () => {
      const exporter = new MemoryExporter();
      await exporter.export([spanData({ name: 'one' })]);
      await exporter.export([spanData({ name: 'two' })]);
      asserts.assertEquals(exporter.spans.map((s) => s.name), ['one', 'two']);
    });

    it('finds a span by name', async () => {
      const exporter = new MemoryExporter();
      await exporter.export([spanData({ name: 'findme' })]);
      asserts.assertEquals(exporter.find('findme')?.name, 'findme');
      asserts.assertEquals(exporter.find('absent'), undefined);
    });

    it('reset empties the buffer', async () => {
      const exporter = new MemoryExporter();
      await exporter.export([spanData()]);
      exporter.reset();
      asserts.assertEquals(exporter.spans.length, 0);
    });
  });

  describe('ConsoleExporter', () => {
    it('prints a human-readable summary', async () => {
      const exporter = new ConsoleExporter();
      const lines = await captureLog(() => exporter.export([spanData()]));
      asserts.assertEquals(lines.length, 1);
      asserts.assertStringIncludes(lines[0]!, 'op');
      asserts.assertStringIncludes(lines[0]!, '250ms');
      asserts.assertStringIncludes(lines[0]!, 'OK');
      asserts.assertStringIncludes(lines[0]!, 'aaaaaaaa');
    });

    it('surfaces an error status and message', async () => {
      const exporter = new ConsoleExporter();
      const lines = await captureLog(() =>
        exporter.export([
          spanData({ status: { code: SpanStatusCode.ERROR, message: 'boom' } }),
        ])
      );
      asserts.assertStringIncludes(lines[0]!, 'ERROR (boom)');
    });

    it('surfaces an error status without a message', async () => {
      const exporter = new ConsoleExporter();
      const lines = await captureLog(() =>
        exporter.export([spanData({ status: { code: SpanStatusCode.ERROR } })])
      );
      asserts.assertStringIncludes(lines[0]!, 'ERROR');
    });

    it('emits JSON lines when configured', async () => {
      const exporter = new ConsoleExporter({ json: true });
      const lines = await captureLog(() => exporter.export([spanData()]));
      asserts.assertEquals(JSON.parse(lines[0]!).name, 'op');
    });
  });
});
