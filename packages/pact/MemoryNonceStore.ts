/**
 * @module
 * In-process default for HMAC nonce replay protection, used when the
 * `claimNonce` hook is absent. It protects a single process; replicas
 * need the hook.
 */

/** Most live nonces remembered before the oldest is forgotten early. */
const MAX_ENTRIES = 100_000;

/** Per-key nonces with their expiry, bounded by {@link MAX_ENTRIES}. */
export class MemoryNonceStore {
  private readonly __expiry = new Map<string, number>();

  /** Record `nonce` for `keyId` for `ttl` seconds; false while it is live. */
  public claim(keyId: string, nonce: string, ttl: number): boolean {
    const key = JSON.stringify([keyId, nonce]);
    const now = Date.now();
    const until = this.__expiry.get(key);
    if (until !== undefined && until > now) return false;
    this.__expiry.delete(key);
    this.__expiry.set(key, now + ttl * 1000);
    // Insertion order is expiry order for one TTL, so the sweep stops at
    // the first live entry once the map is back within its bound.
    for (const [entry, expires] of this.__expiry) {
      if (expires > now && this.__expiry.size <= MAX_ENTRIES) break;
      this.__expiry.delete(entry);
    }
    return true;
  }
}
