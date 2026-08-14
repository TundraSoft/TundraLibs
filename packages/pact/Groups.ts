/**
 * @fileoverview The PACT group-grants cache.
 *
 * PACT never creates or manages groups — the consumer owns them and supplies
 * a {@link GroupResolver}. `Groups` wraps that hook with a cache: unknown
 * group ids are resolved lazily on first use, cached, and refreshed on
 * `sync()` (which the `PACT` facade calls manually via `syncGroups()` or on
 * a `syncInterval` timer). Multi-group semantics are OR — any group that
 * grants a permission grants it to the principal.
 *
 * Exported standalone; the `PACT` facade composes it.
 *
 * @module
 */

import { combineGrants } from './grants.ts';
import type { GroupResolver, PACTGrants } from './types/mod.ts';

/**
 * How many times a single resolve is retried when a concurrent
 * {@link Groups.clear} invalidates it mid-flight. One retry covers the
 * realistic case (a revocation webhook firing during a permission check);
 * the bound keeps a pathological `clear()` storm from looping forever. [R2]
 */
const MAX_RESOLVE_ATTEMPTS = 3;

/** Lazily-cached view over a consumer's group grants. */
export class Groups {
  private readonly __resolver: GroupResolver;
  private readonly __cache = new Map<string, PACTGrants>();
  /**
   * Monotonic issue counter + per-key last-applied generation. Cache writes
   * apply in *issue* order, never resolution order, so a slow earlier
   * resolve can't overwrite (resurrect) a value a later call already
   * refreshed. [M1]
   */
  private __epoch = 0;
  private readonly __applied = new Map<string, number>();
  /**
   * Clear fence: the highest generation invalidated by a {@link Groups.clear}.
   * A resolve already in flight when `clear()` runs holds a generation issued
   * *before* the clear; without a fence its late write would resurrect the
   * dropped (e.g. revoked) grants — and because the id is cached again, it is
   * never re-resolved. `__apply` refuses any write whose generation is at or
   * below this fence, and `__resolve` then re-runs the resolver so the fenced
   * caller still gets post-clear grants rather than none. [M2] [R2]
   */
  private __clearedThrough = 0;

  /**
   * Wrap a consumer's group resolver in a lazy cache. Nothing is fetched here
   * — ids resolve on first use and stay cached until {@link Groups.sync}
   * refreshes them or {@link Groups.clear} drops them.
   */
  constructor(resolver: GroupResolver) {
    this.__resolver = resolver;
  }

  /** Group ids currently cached. */
  get cached(): string[] {
    return [...this.__cache.keys()];
  }

  /**
   * Make sure every id in `groupIds` is cached — resolves the missing ones
   * through the resolver. Ids the resolver omits are cached as having no
   * grants (`{}`), so they are not re-fetched per check.
   *
   * The "every id is cached" guarantee holds even against a concurrent
   * {@link Groups.clear}. A clear that lands mid-resolve both invalidates the
   * values just fetched *and* evicts ids that were already cached when this
   * call started (so they were never in the missing set); both are re-resolved
   * in a bounded loop ({@link MAX_RESOLVE_ATTEMPTS}) rather than leaving any
   * requested id un-cached. [R2] [R6]
   */
  async ensure(groupIds: ReadonlyArray<string>): Promise<void> {
    await this.__ensure(groupIds);
  }

  /**
   * The combined grants of `groupIds` (resolved/cached as needed), OR-merged
   * with the optional `direct` per-principal grants.
   *
   * Always reflects the grants the resolver returned for this call: when a
   * concurrent {@link Groups.clear} fences the cache write, the freshly
   * resolved values are still what this caller sees, and an id the same
   * `clear()` evicted while this call was awaiting is resolved again by the
   * shared re-resolve loop. Answering with an empty map would be a silent
   * false-deny. [R2]
   */
  async combined(
    groupIds: ReadonlyArray<string>,
    direct?: PACTGrants,
  ): Promise<PACTGrants> {
    const fetched = await this.__ensure(groupIds);
    return combineGrants(
      direct,
      ...groupIds.map((id) => this.__cache.get(id) ?? fetched[id] ?? {}),
    );
  }

  /**
   * Re-fetch grants for `groupIds` (default: every cached id) through the
   * resolver, replacing cached values.
   *
   * @returns the ids that were refreshed — empty when nothing was cached, or
   *   when repeated concurrent {@link Groups.clear} calls kept invalidating
   *   the refresh so that nothing was written [R2]
   */
  async sync(groupIds?: ReadonlyArray<string>): Promise<string[]> {
    const ids = groupIds && groupIds.length > 0
      ? [...new Set(groupIds)]
      : [...this.__cache.keys()];
    if (ids.length === 0) return [];
    const { applied } = await this.__resolve(ids);
    return applied ? ids : [];
  }

  /** Drop every cached group (next use re-resolves). */
  clear(): void {
    this.__cache.clear();
    this.__applied.clear();
    // Fence every generation issued so far: any resolve currently in flight
    // was issued at or below the current epoch, so its late write is now
    // rejected by __apply and the cleared ids re-resolve on next use. [M2]
    this.__clearedThrough = this.__epoch;
  }

  /**
   * The re-resolve-until-cached core shared by {@link Groups.ensure} and
   * {@link Groups.combined}. Resolves the ids not yet cached, then re-checks:
   * a {@link Groups.clear} that lands mid-resolve can evict ids that were
   * *already* cached when this call started — so they were never in the first
   * `missing` set — and those must be resolved again too. Loops until every
   * requested id is cached, bounded by {@link MAX_RESOLVE_ATTEMPTS} so a
   * pathological `clear()` storm cannot spin forever. [R2] [R6]
   *
   * @returns the values the resolver produced for the ids it had to fetch, so
   *   a caller can fall back to them if a `clear()` storm fenced every cache
   *   write. Empty when nothing had to be resolved.
   */
  private async __ensure(
    groupIds: ReadonlyArray<string>,
  ): Promise<Record<string, PACTGrants>> {
    let fetched: Record<string, PACTGrants> = {};
    for (let pass = 0; pass < MAX_RESOLVE_ATTEMPTS; pass++) {
      const missing = groupIds.filter((id) => !this.__cache.has(id));
      if (missing.length === 0) break;
      const resolved = await this.__resolve([...new Set(missing)]);
      fetched = { ...fetched, ...resolved.fetched };
    }
    return fetched;
  }

  /**
   * Resolve `ids` and write the result to the cache.
   *
   * A {@link Groups.clear} that lands while the resolver is in flight fences
   * the write: those values pre-date the invalidation, so caching them would
   * resurrect (possibly revoked) grants. The batch is then re-resolved, which
   * both keeps `ensure`'s "every id is cached" contract and hands the caller
   * post-clear values instead of nothing — dropping the batch outright made
   * the in-flight `combined()` see an empty grants map, i.e. a silent
   * false-deny. [R2]
   *
   * @returns `applied` — whether the cache write went through — and the last
   *   values the resolver returned (the caller's fallback when it did not).
   */
  private async __resolve(
    ids: string[],
  ): Promise<{ applied: boolean; fetched: Record<string, PACTGrants> }> {
    let fetched: Record<string, PACTGrants> = {};
    for (let attempt = 0; attempt < MAX_RESOLVE_ATTEMPTS; attempt++) {
      const gen = ++this.__epoch;
      fetched = await this.__resolver(ids);
      if (this.__apply(ids, fetched, gen)) return { applied: true, fetched };
    }
    // Repeatedly fenced (a clear() storm): serve the caller the newest values
    // we have without caching them, so the next use resolves again.
    return { applied: false, fetched };
  }

  /**
   * Write resolver results, but never let an older resolve (lower `gen`)
   * overwrite a key a newer call already applied [M1], nor let a resolve that
   * was in flight across a {@link Groups.clear} resurrect the dropped
   * grants [M2].
   *
   * @returns `false` when the whole batch was fenced by a `clear()` (the
   *   caller re-resolves); `true` when the write was allowed — including the
   *   per-key [M1] skips, where a newer value is already cached.
   */
  private __apply(
    ids: ReadonlyArray<string>,
    fetched: Record<string, PACTGrants>,
    gen: number,
  ): boolean {
    // A clear() advanced the fence past this (pre-clear) generation — drop the
    // whole batch so the cleared ids re-resolve instead of being resurrected.
    if (gen <= this.__clearedThrough) return false;
    for (const id of ids) {
      if ((this.__applied.get(id) ?? 0) > gen) continue;
      this.__cache.set(id, fetched[id] ?? {});
      this.__applied.set(id, gen);
    }
    return true;
  }
}
