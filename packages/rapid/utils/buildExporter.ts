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
import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';
import { RapidError } from '../errors/mod.ts';
import type { RapidApplicationExporterConfig } from '../types/mod.ts';

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
    case 'OTLP':
      return new BatchSpanProcessor(
        new OTLPExporter({
          baseURL: descriptor.baseURL,
          headers: descriptor.headers,
        }),
      );
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
