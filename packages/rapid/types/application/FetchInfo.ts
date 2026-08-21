/**
 * @fileoverview {@link RapidApplicationFetchInfo} — the per-request
 * extras a host may hand `Application.fetch()` alongside the `Request`.
 *
 * @module
 */

/**
 * What the host knows about a request that the `Request` itself does
 * not carry. Rapid stays host-agnostic: a Worker passes
 * `request.headers.get('cf-connecting-ip')`, `Deno.serve` passes
 * `info.remoteAddr.hostname`, a test passes nothing.
 */
export type RapidApplicationFetchInfo = {
  /** Client address; `ctx.remoteAddress` is `''` when absent. */
  remoteAddress?: string | null;
};
