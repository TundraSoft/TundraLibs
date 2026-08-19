/**
 * @fileoverview {@link RapidApplicationExporterConfig} — declarative span-exporter descriptor
 * (file-able in YAML/JSON config).
 *
 * @module
 */

/**
 * DECLARATIVE exporter descriptor — fully file-able (the reason it
 * exists: exporter INSTANCES cannot live in YAML). rAPId maps it to the
 * real exporter at construction; `OTLP` is auto-wrapped in a
 * `BatchSpanProcessor` (unbatched OTLP is one HTTP round-trip per
 * span). An actual `SpanExporter` instance is also accepted — the
 * code-composition path (`new Application(...)`) for custom exporters.
 */
export type RapidApplicationExporterConfig =
  | { type: 'CONSOLE' }
  | {
    type: 'OTLP';
    /** Collector root, not the signal path (e.g. http://collector:4318). */
    baseURL: string;
    /** Extra headers (auth keys etc.). */
    headers?: Record<string, string>;
  };
