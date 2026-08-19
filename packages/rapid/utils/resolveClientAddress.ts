/**
 * @fileoverview `resolveClientAddress` — turn the socket peer plus any
 * proxy headers into a trustworthy client address, decoupled from the
 * HTTP context so the (security-critical) hop logic is unit-testable.
 *
 * @module
 */

import { isPublicIP } from '@tundralibs/utils';

/** The resolved client address plus the full observed hop chain. */
export type ResolvedClientAddress = {
  /**
   * The client address to trust: the resolved public address, or `''`
   * when none is trustworthy (private/loopback, or proxy headers not
   * trusted).
   */
  address: string;
  /** Socket peer + trusted forwarded hops, in observed order (inspection). */
  chain: string[];
};

/**
 * Resolve the client address from the socket peer and `x-forwarded-for`
 * / `x-real-ip`.
 *
 * `trustProxy` is a HOP COUNT: `0`/`false` (the safe default) ignores
 * proxy headers entirely — a client cannot spoof its address; `1`/`true`
 * trusts one proxy and uses the address that proxy observed (the
 * RIGHTMOST forwarded entry, not the client-forgeable leftmost); `N`
 * trusts N proxies (clamped: fewer forwarded hops than trusted yields
 * the leftmost, i.e. the original client).
 *
 * @param socketAddress - Transport-reported peer ('' when unknown/unix).
 * @param headers - The request headers.
 * @param trustProxy - Hop count (`boolean` maps to `0`/`1`).
 */
export function resolveClientAddress(
  socketAddress: string,
  headers: Headers,
  trustProxy: boolean | number | undefined,
): ResolvedClientAddress {
  const hops = trustProxy === true
    ? 1
    : trustProxy === false || trustProxy === undefined
    ? 0
    : trustProxy;
  const chain: string[] = [];
  if (socketAddress) chain.push(socketAddress);
  let resolved = socketAddress;

  if (hops > 0) {
    const xff = (headers.get('x-forwarded-for') ?? '')
      .split(',').map((ip) => ip.trim()).filter((ip) => ip.length > 0);
    chain.push(...xff);
    if (xff.length > 0) {
      resolved = xff[Math.max(0, xff.length - hops)]!;
    } else {
      const realIp = headers.get('x-real-ip')?.trim();
      if (realIp) {
        chain.push(realIp);
        resolved = realIp;
      }
    }
  }
  // Only a public address is trustworthy as the client; a private or
  // loopback resolved value means none was available.
  return { address: resolved && isPublicIP(resolved) ? resolved : '', chain };
}
