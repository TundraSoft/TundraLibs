/**
 * @module
 * In-process default for TOTP replay protection and MFA attempt limits,
 * used when the `claimTotpStep` / `countMfaAttempt` / `resetMfaAttempts`
 * hooks are absent. It protects a single process; replicas need the hooks.
 */

/** Most users tracked per map before the oldest entry is evicted. */
const MAX_ENTRIES = 10_000;

/**
 * Per-user last accepted TOTP step and attempt counters, each map bounded
 * by {@link MAX_ENTRIES} in least-recently-written order.
 */
export class MemoryMfaGuard {
  private readonly __steps = new Map<string, number>();
  private readonly __attempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  /** Record `step` if it is later than the user's last one; true if so. */
  public claimStep(userId: string, step: number): boolean {
    const last = this.__steps.get(userId);
    if (last !== undefined && last >= step) return false;
    MemoryMfaGuard.__write(this.__steps, userId, step);
    return true;
  }

  /** Count an attempt; returns the attempts in the live window. */
  public countAttempt(userId: string, windowSeconds: number): number {
    const now = Date.now();
    const live = this.__attempts.get(userId);
    const entry = live !== undefined && live.resetAt > now
      ? { count: live.count + 1, resetAt: live.resetAt }
      : { count: 1, resetAt: now + windowSeconds * 1000 };
    MemoryMfaGuard.__write(this.__attempts, userId, entry);
    return entry.count;
  }

  /** Forget the user's attempts. */
  public resetAttempts(userId: string): void {
    this.__attempts.delete(userId);
  }

  /** Write as most recent, evicting the oldest entry past the bound. */
  private static __write<V>(map: Map<string, V>, key: string, value: V) {
    map.delete(key);
    map.set(key, value);
    if (map.size > MAX_ENTRIES) {
      map.delete(map.keys().next().value!);
    }
  }
}
