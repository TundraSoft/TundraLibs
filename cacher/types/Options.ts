import type { Engine } from '../Engines.ts';

/**
 * Options for configuring the cache driver.
 */
export type CacherOptions = {
  /**
   * The engine to be used for caching.
   */

  engine: Engine;

  /**
   * The default expiry time for cached items, in seconds.
   * 0 means never expire. Maximum of 6hrs (21600 seconds).
   * Default is 300 seconds (5 minutes).
   */
  defaultExpiry?: number;
};
