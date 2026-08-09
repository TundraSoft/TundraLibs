/**
 * @fileoverview {@link TracerOptions} — configuration for a {@link Tracer}.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { Attributes } from './Attributes.ts';
import type { IdGenerator } from './IdGenerator.ts';
import type { Sampler } from './Sampler.ts';
import type { SpanExporter } from './SpanExporter.ts';

/** Configuration for a {@link Tracer}. */
export type TracerOptions = {
  /**
   * Logical name of this service — becomes the `service.name` resource
   * attribute, which is how backends group and name your traces. Required.
   */
  serviceName: string;
  /**
   * Where finished spans go. Defaults to a no-op: a tracer with no exporter
   * still creates and propagates spans (so correlation ids keep working) but
   * emits nothing.
   */
  exporter?: SpanExporter;
  /**
   * Whether to record each span. Defaults to `alwaysOnSampler`.
   * See {@link Sampler} for the determinism requirement.
   */
  sampler?: Sampler;
  /**
   * Trace/span id generation. Defaults to `randomIdGenerator`. Validated once
   * at construction — see {@link IdGenerator}.
   */
  idGenerator?: IdGenerator;
  /**
   * Extra resource attributes merged with `service.name` — e.g.
   * `deployment.environment`, `service.version`.
   */
  resource?: Attributes;
};
