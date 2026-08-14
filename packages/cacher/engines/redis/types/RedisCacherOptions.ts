import type { EngineSSLOptions } from '@tundralibs/drivers';
import type { CacherOptions } from '../../../types/mod.ts';

/**
 * Configuration options for the Redis cacher.
 *
 * `host` is required; the constructor throws `CONFIG_MISSING` when it
 * isn't supplied. All TLS configuration is delegated to the underlying
 * `RedisEngine` via the standard {@link EngineSSLOptions} shape — both
 * inline PEM (`ca`/`cert`/`key`) and file paths (`caFile`/`certFile`/
 * `keyFile`) are accepted, plus `rejectUnauthorized` and `enforce`.
 *
 * @extends CacherOptions Base options inherited by all cachers
 * @see {@link RedisCacher} The class that uses these options
 * @see {@link CacherOptions} For common caching options
 * @example
 * ```ts
 * const options: RedisCacherOptions = {
 *   host: 'localhost',
 *   port: 6379,
 *   password: 'securepassword',
 *   db: 0,
 *   defaultExpiry: 600,
 *   ssl: { caFile: '/etc/ssl/redis-ca.pem' },
 * };
 * ```
 */
export type RedisCacherOptions = CacherOptions & {
  /** The Redis server host. Required. */
  host: string;

  /** The Redis server port. Defaults to 6379 if not specified. */
  port?: number;

  /** Optional Redis username for authentication. */
  username?: string;

  /** Optional Redis password for authentication. */
  password?: string;

  /** Optional Redis database number. */
  db?: number;

  /**
   * TLS configuration. Pass `true` for default TLS (system roots,
   * no client cert), or an {@link EngineSSLOptions} object for fine
   * control. Forwarded verbatim to the underlying `RedisEngine`.
   */
  ssl?: boolean | EngineSSLOptions;
};
