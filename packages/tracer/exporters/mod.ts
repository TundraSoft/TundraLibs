/**
 * @fileoverview Built-in span exporters.
 *
 * The OTLP exporter lives behind its own subpath (`@tundralibs/tracer/exporters/otlp`)
 * so the core stays dependency-free — importing a tracer does not pull an HTTP
 * client into the graph.
 *
 * @module
 */

export {
  ConsoleExporter,
  type ConsoleExporterOptions,
} from './ConsoleExporter.ts';
export { MemoryExporter } from './MemoryExporter.ts';
