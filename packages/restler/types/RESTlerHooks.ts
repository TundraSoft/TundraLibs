/**
 * @fileoverview The observability hooks — the suite's `Witness` convention
 * and the per-request `headerProvider` seam. Both are structural: RESTler
 * imports no logging or tracing package, and the matching adapters
 * (`tracer.wrapClient`, `tracer.propagation`) satisfy these shapes without
 * either package knowing the other exists.
 *
 * @module
 */

/**
 * What a {@link Witness} learns about the operation it wraps: a span-style
 * name and flat attributes. RESTler names requests
 * `restler.<vendor> <METHOD>` and passes the vendor, method, and raw path
 * as attributes — never the resolved URL or query string, which can carry
 * credentials or PII.
 */
export type WitnessInfo = {
  /** Span-style operation name, e.g. `restler.github GET`. */
  name: string;
  /** Flat descriptive attributes, e.g. `{ 'restler.vendor': 'github' }`. */
  attributes?: Record<string, unknown>;
};

/**
 * The suite's **Witness** convention (shared shape with `@tundralibs/norm`):
 * a wrap hook that observes an operation without interfering. A witness
 * MUST call `fn` exactly once, return its result unchanged, and re-throw
 * its errors — `tracer.wrapClient` satisfies the contract by construction
 * and opens a `CLIENT` span per request.
 */
export type Witness = <T>(
  info: WitnessInfo,
  fn: () => Promise<T>,
) => Promise<T>;

/**
 * Per-request outbound header seam. Called once per request while the
 * request is being assembled — inside the {@link Witness} window when both
 * hooks are configured, which is what lets `tracer.propagation` emit a
 * `traceparent` carrying that request's own span id.
 *
 * Sync by design (mirrors slogger's `contextProvider`); a thrown error is
 * contained — the request proceeds without the provider's headers, because
 * observability wiring must never break the operation.
 */
export type RESTlerHeaderProvider = () => Record<string, string>;
