/**
 * @fileoverview {@link IdGenerator} — pluggable trace/span id generation.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * Generates W3C-conformant trace and span ids. The default implementation
 * (`randomIdGenerator`) uses `crypto.getRandomValues`; override it when a
 * backend requires a different format — AWS X-Ray, for instance, needs a
 * timestamp-prefixed trace id and rejects pure-random ones — or to make ids
 * deterministic in tests.
 *
 * A custom generator is smoke-tested once at {@link Tracer} construction: its
 * output must match the widths and character set below, or construction throws.
 * Ids that look wrong are otherwise silently dropped by collectors, which is a
 * miserable failure to debug.
 */
export type IdGenerator = {
  /**
   * A new trace id: 32 lowercase hex characters, never all-zero.
   */
  traceId(): string;

  /**
   * A new span id: 16 lowercase hex characters, never all-zero.
   */
  spanId(): string;
};
