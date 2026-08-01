import type { EngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `MongoEngine`.
 *
 * Network fields (`host`, `port`, `username`, `password`, `database`)
 * are inherited from {@link EngineOptions}. The constructor enforces
 * that **either** `uri` **or** `host` is present.
 *
 * Either supply individual fields (`host`, `port`, etc.) OR pass a
 * complete `uri` (e.g. `mongodb+srv://...`) which takes precedence.
 *
 * @extends EngineOptions
 */
export type MongoEngineOptions = EngineOptions & {
  /**
   * Queries slower than this many **seconds** fire the `slowQuery`
   * event (in addition to `query`). Defaults to `0.5`.
   */
  slowQueryThreshold?: number;
  /** Full MongoDB connection URI (overrides individual fields). */
  uri?: string;
  /** Replica set name. */
  replicaSet?: string;
  /** authSource override (default: `admin` when username is set). */
  authSource?: string;
  /**
   * Extra options passed verbatim to `MongoClient.connect`. Use sparingly —
   * the standard fields above cover most cases.
   */
  driverOptions?: Record<string, unknown>;
};
