/**
 * Network connection options.
 *
 * Optional at the base level — engines that don't require a network
 * connection (e.g. SQLite, in-memory caches) can omit them.
 *
 * @module
 */

export type EngineNetworkOptions = {
  /** Database / service hostname. */
  host?: string;
  /** Database / service port. */
  port?: number;
  /** Database / service username. */
  username?: string;
  /** Database / service password. */
  password?: string;
  /**
   * Database / namespace identifier. Most engines accept a string (database
   * name); Redis accepts a numeric index. Drivers convert as needed.
   */
  database?: string | number;
};
