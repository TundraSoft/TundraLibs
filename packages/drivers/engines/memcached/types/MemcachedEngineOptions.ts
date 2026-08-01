import type { EngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `MemcachedEngine`.
 *
 * Network fields (`host`, `port`) are inherited from
 * {@link EngineOptions}. The constructor enforces that `host` is
 * present. Memcached has no notion of authentication, username,
 * password, or database in its base text-protocol form — those fields
 * on the parent are ignored.
 *
 * Both TCP (`host` + `port`) and Unix sockets (`host` ending in
 * `.sock`) are supported.
 *
 * @extends EngineOptions
 * @see {@link MemcachedEngine}
 * @example
 * ```ts
 * const options: MemcachedEngineOptions = {
 *   host: 'localhost',
 *   port: 11211,
 *   maxBufferSize: 4,        // 4 MB per response
 *   pool: { min: 1, max: 10 },
 * };
 * ```
 */
export type MemcachedEngineOptions = EngineOptions & {
  /** Maximum response buffer size in megabytes. Defaults to 2. */
  maxBufferSize?: number;
  /**
   * Commands slower than this many **seconds** fire the `slowQuery`
   * event (in addition to `query`). Defaults to `0.5`.
   */
  slowQueryThreshold?: number;
};
