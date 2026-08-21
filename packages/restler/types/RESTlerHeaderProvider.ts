/**
 * @fileoverview Per-request outbound header seam for observability wiring.
 *
 * @module
 */

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
