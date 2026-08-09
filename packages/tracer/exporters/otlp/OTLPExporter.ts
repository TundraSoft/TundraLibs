/**
 * @fileoverview {@link OTLPExporter} — ships finished spans to an OTLP
 * collector over HTTP with a JSON payload.
 *
 * Built on `RESTler` so URL validation, timeouts, headers and the request
 * pipeline are inherited rather than re-implemented. It lives behind the
 * `@tundralibs/tracer/exporters/otlp` subpath so the tracer core stays free of an HTTP
 * client — a CLI or worker that only creates spans never pulls this in.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { BatchSpanProcessor, Tracer } from '@tundralibs/tracer';
 * import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';
 *
 * const tracer = new Tracer({
 *   serviceName: 'orders',
 *   // Batch, or every span costs one HTTP round-trip.
 *   exporter: new BatchSpanProcessor(
 *     new OTLPExporter({ baseURL: 'http://localhost:4318' }),
 *   ),
 * });
 * ```
 */

import { RESTler } from '@tundralibs/restler';
import type { RESTlerOptions } from '@tundralibs/restler/types';
import type { SpanData, SpanExporter } from '../../types/mod.ts';
import { encodeSpans } from './encode.ts';

/** Options for {@link OTLPExporter}. */
export type OTLPExporterOptions = RESTlerOptions & {
  /**
   * Path appended to `baseURL` for the traces signal. The OTLP spec fixes this
   * at `/v1/traces`; it is configurable only for gateways that mount the
   * collector under a prefix.
   *
   * @default '/v1/traces'
   */
  tracesPath?: string;
  /**
   * Called when a span cannot be encoded, or when the collector rejects the
   * batch. Export failures are otherwise **silent** — telemetry must not
   * surface as an application error — so this is the only way to see them.
   */
  onExportError?: (error: unknown, spans: SpanData[]) => void;
};

/** The OTLP-defined path for the traces signal. */
const DEFAULT_TRACES_PATH = '/v1/traces';

/**
 * Exports spans to an OTLP collector (`/v1/traces`, JSON over HTTP).
 *
 * Deliberately **JSON only** — gRPC and protobuf-over-HTTP are out of scope.
 * A collector accepts JSON on the front door and re-exports in any format the
 * backend wants, so supporting them here would duplicate the collector.
 */
export class OTLPExporter extends RESTler<OTLPExporterOptions>
  implements SpanExporter {
  /** Vendor tag used by RESTler for logging/metrics. */
  public readonly vendor = 'otlp';

  private readonly __tracesPath: string;
  private readonly __onExportError?: (
    error: unknown,
    spans: SpanData[],
  ) => void;

  /**
   * @param options - See {@link OTLPExporterOptions}. `baseURL` is the
   *   collector root (e.g. `http://localhost:4318`), NOT the signal path.
   * @throws {Error} When `baseURL` is missing or invalid (raised by RESTler's
   *   own option validation).
   */
  constructor(options: OTLPExporterOptions) {
    super({ contentType: 'JSON', ...options });
    this.__tracesPath = options.tracesPath ?? DEFAULT_TRACES_PATH;
    this.__onExportError = options.onExportError;
  }

  /**
   * Encode and POST a batch of spans.
   *
   * Never rejects: a collector that is down, slow, or unhappy is an
   * observability problem, and surfacing it into the application would make
   * tracing able to break the code it observes. Failures go to
   * {@link OTLPExporterOptions.onExportError} instead.
   *
   * @param spans - Finished spans to export. Never empty.
   */
  public async export(spans: SpanData[]): Promise<void> {
    try {
      const payload = encodeSpans(spans, (span, error) => {
        this.__onExportError?.(error, [span]);
      });
      // Every span in the batch failed to encode — nothing to send.
      if (payload.resourceSpans.length === 0) return;

      const response = await this._makeRequest({
        path: this.__tracesPath,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      });

      // The collector answers 2xx on accept; anything else means the batch was
      // rejected (bad payload, auth, backpressure) and the spans are gone.
      const status = response.status ?? 0;
      if (status < 200 || status >= 300) {
        this.__onExportError?.(
          new Error(
            `OTLP collector rejected the batch: ${status} ${
              response.statusText ?? ''
            }`
              .trim(),
          ),
          spans,
        );
      }
    } catch (error) {
      this.__onExportError?.(error, spans);
    }
  }

  /**
   * No-op: RESTler holds no persistent connection, so there is nothing to
   * flush or release. Present to satisfy {@link SpanExporter}, and so wrapping
   * processors can call `shutdown()` unconditionally.
   */
  public shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
