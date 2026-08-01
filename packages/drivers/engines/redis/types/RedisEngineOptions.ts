import type { EngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `RedisEngine`.
 *
 * Network fields (`host`, `port`, `username`, `password`, `database`)
 * are inherited from {@link EngineOptions}. The constructor enforces
 * that `host` is present. `database` (when supplied) must be a number
 * — Redis databases are numeric indices.
 *
 * @extends EngineOptions
 * @example
 * ```ts
 * const options: RedisEngineOptions = {
 *   host: 'localhost',
 *   port: 6379,
 *   password: 'secret',
 *   database: 0,
 *   pool: { min: 1, max: 8 },
 * };
 * ```
 */
export type RedisEngineOptions = EngineOptions & {
  /**
   * Maximum response buffer size in megabytes.
   * Responses exceeding this throw `OPERATION_FAILED`. Defaults to 16 MB.
   */
  maxBufferSize?: number;
  /**
   * Commands slower than this many **seconds** fire the `slowQuery`
   * event (in addition to `query`). Defaults to `0.5`.
   */
  slowQueryThreshold?: number;
};
