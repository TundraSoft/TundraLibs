/**
 * @fileoverview buildExporter — declarative exporter config → SpanExporter.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { buildExporter } from './buildExporter.ts';
import { ConsoleExporter, type SpanExporter } from '@tundralibs/tracer';
import { RapidError } from '../errors/mod.ts';

describe('rapid.buildExporter', () => {
  it('undefined → undefined', () => {
    asserts.assertEquals(buildExporter(undefined), undefined);
  });

  it('CONSOLE → a ConsoleExporter', () => {
    asserts.assert(
      buildExporter({ type: 'CONSOLE' }) instanceof ConsoleExporter,
    );
  });

  it('OTLP → a batching exporter (has export())', () => {
    const e = buildExporter({ type: 'OTLP', baseURL: 'http://collector:4318' });
    asserts.assert(e !== undefined && typeof e.export === 'function');
  });

  it('a SpanExporter instance is passed through unchanged', () => {
    const instance: SpanExporter = {
      export: () => {},
      shutdown: () => Promise.resolve(),
      forceFlush: () => Promise.resolve(),
    } as unknown as SpanExporter;
    asserts.assert(buildExporter(instance) === instance);
  });

  it('an unknown descriptor type is a loud RAPID_CONFIG error', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => buildExporter({ type: 'NONSENSE' } as any),
      RapidError,
      'CONSOLE or OTLP',
    );
  });
});

describe('rapid.utils.buildExporter — OTLP is lazy but validated at boot', () => {
  it('a malformed baseURL fails at build, not at first export', () => {
    asserts.assertThrows(
      () => buildExporter({ type: 'OTLP', baseURL: 'not a url' }),
      RapidError,
      'baseURL must be an absolute URL',
    );
  });
  it('a valid descriptor yields an exporter without loading the OTLP module up front', () => {
    const exporter = buildExporter({
      type: 'OTLP',
      baseURL: 'http://127.0.0.1:1/v1/traces',
    });
    asserts.assert(exporter !== undefined);
    asserts.assertEquals(typeof exporter.export, 'function');
    asserts.assertEquals(typeof exporter.shutdown, 'function');
  });
});
