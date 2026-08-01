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
   * UUID-v4 generated at request entry. Use for log correlation
   * and for forwarding as a trace header to downstream services.
   */
  requestId: string;

  /** When the request was received. Subtract from `Date.now()` for duration. */
  requestTime: Date;
};
