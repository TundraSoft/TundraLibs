/**
 * @fileoverview {@link RapidApplicationHeaderOptions} — the header names
 * the core itself reads and stamps on every HTTP response. Grouped by
 * what they are, not by which component uses them, so a custom
 * middleware can read the same configuration.
 *
 * @module
 */

/** Header names the request cycle honours; every one is configurable. */
export type RapidApplicationHeaderOptions = {
  /**
   * The correlation-id header: a validated inbound value is ADOPTED
   * (trusted-edge reuse), anything unsafe or absent mints a fresh id, and
   * the id is echoed under this name on every response — 404s and errors
   * included.
   * @default 'x-request-id'
   */
  requestId?: string;
  /**
   * Additional response headers that also carry the request id, for
   * clients or proxies expecting another name (`['x-correlation-id']`).
   * @default []
   */
  requestIdEcho?: readonly string[];
  /**
   * The response header carrying how long the request spent in the
   * framework, from arrival to the headers being sent, as `<ms>ms` —
   * error responses included. `false` omits it.
   * @default 'x-response-time'
   */
  responseTime?: string | false;
};
