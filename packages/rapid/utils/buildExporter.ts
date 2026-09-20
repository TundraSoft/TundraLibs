/**
 * @fileoverview `buildExporter` — map a declarative exporter descriptor
 * (or a passthrough instance) to a tracer `SpanExporter`, decoupled from
 * the app so the config mapping is unit-testable.
 *
 * @module
 */

import {
  BatchSpanProcessor,
  ConsoleExporter,
  type SpanExporter,
} from '@tundralibs/tracer';
import { RapidError } from '../errors/mod.ts';
import type { RapidApplicationExporterConfig } from '../types/mod.ts';

/**
 * An OTLP exporter that loads `@tundralibs/tracer/exporters/otlp` on first
 * use rather than at import. The Application constructor is synchronous
 * and owns a readonly tracer, so the deferral has to live inside the
 * exporter: a fetch()-only deployment that never configures OTLP never
 * pulls the module, and one that does pays the load on its first export.
 * Honours the SpanExporter contract — a load failure rejects `export()`
 * (which BatchSpanProcessor absorbs) rather than throwing into a caller.
 */
const lazyOtlp = (
  descriptor: { baseURL: string; headers?: Record<string, string> },
): SpanExporter => {
  let real: Promise<SpanExporter> | undefined;
  const load = (): Promise<SpanExporter> =>
    real ??= import('@tundralibs/tracer/exporters/otlp').then(
      ({ OTLPExporter }) =>
        new OTLPExporter({
          baseURL: descriptor.baseURL,
          headers: descriptor.headers,
        }),
    );
  return {
    export: (spans) => load().then((e) => e.export(spans)),
    shutdown: async () => {
      // Never loaded → nothing to flush; do not load just to shut down.
      if (real === undefined) return;
      const e = await real;
      await e.shutdown?.();
    },
  };
};

/**
 * Resolve the tracer exporter:
 * - `undefined` → `undefined` (tracing configured without an exporter).
 * - a `SpanExporter` instance → passed through (the code path).
 * - `{ type: 'CONSOLE' }` → a {@link ConsoleExporter}.
 * - `{ type: 'OTLP', baseURL, headers? }` → an {@link OTLPExporter}
 *   wrapped in a {@link BatchSpanProcessor} (unbatched OTLP is one HTTP
 *   round-trip per span).
 *
 * @throws {RapidError} RAPID_CONFIG for an unknown descriptor `type`.
 */
export function buildExporter(
  exporter: RapidApplicationExporterConfig | SpanExporter | undefined,
): SpanExporter | undefined {
  if (exporter === undefined) return undefined;
  if ('export' in exporter && typeof exporter.export === 'function') {
    return exporter as SpanExporter;
  }
  const descriptor = exporter as RapidApplicationExporterConfig;
  switch (descriptor.type) {
    case 'CONSOLE':
      return new ConsoleExporter();
    case 'OTLP': {
      // Validate NOW, at boot — the exporter itself is constructed lazily
      // (below), and a bad URL must still fail where config errors fail.
      try {
        new URL(descriptor.baseURL);
      } catch {
        throw new RapidError('RAPID_CONFIG', {
          message: 'tracer.exporter.baseURL must be an absolute URL',
          details: {
            key: 'tracer.exporter.baseURL',
            value: descriptor.baseURL,
          },
        });
      }
      return new BatchSpanProcessor(lazyOtlp(descriptor));
    }
    default:
      throw new RapidError('RAPID_CONFIG', {
        message: 'tracer.exporter.type must be CONSOLE or OTLP',
        details: {
          key: 'tracer.exporter',
          value: (descriptor as { type?: string }).type,
        },
      });
  }
}
