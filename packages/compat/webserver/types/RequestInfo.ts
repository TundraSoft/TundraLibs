/**
 * Per-request metadata passed alongside the `Request` to handlers
 * and events.
 */
export type RequestInfo = {
  /**
   * Client IP. IPv4 or IPv6 in TCP mode; `null` in UNIX mode (no
   * IP) or when the runtime doesn't surface connection info. For
   * proxied requests prefer `X-Forwarded-For`.
   */
  remoteAddress: string | null;

  /** Client port. `null` in UNIX mode or when not exposed by the runtime. */
  remotePort: number | null;

  /**
   * UUID-v4 for this request — minted on FIRST access, then stable
   * for the request's lifetime (consumers that never read it don't
   * pay for it). Use for log correlation and for forwarding as a
   * trace header to downstream services.
   */
  requestId: string;

  /**
   * When the request was received (captured at entry; the Date object
   * itself is built lazily on first access, then cached). Subtract
   * from `Date.now()` for duration.
   */
  requestTime: Date;
};
