import type { EngineSSLOptions } from '@tundralibs/drivers';
import type { CacherOptions } from '../../../types/mod.ts';

/**
 * Configuration options for the Memcached cacher.
 *
 * `host` is required. All TLS configuration is delegated to the
 * underlying `MemcachedEngine` via the standard
 * {@link EngineSSLOptions} shape — both inline PEM (`ca`/`cert`/`key`)
 * and file paths (`caFile`/`certFile`/`keyFile`) are accepted, plus
 * `rejectUnauthorized` and `enforce`. Stock memcached doesn't speak
 * TLS unless built with `--enable-tls`; the relevant deployments are
 * managed offerings (e.g. AWS ElastiCache for Memcached).
 *
 * @extends CacherOptions
 * @see {@link MemCacher} The class that uses these options
 * @example
 * ```ts
 * const options: MemCacherOptions = {
 *   host: 'localhost',
 *   port: 11211,
 *   defaultExpiry: 600,
 * };
 * ```
 */
export type MemCacherOptions = CacherOptions & {
  /** The Memcached server host. Required. */
  host: string;

  /** The Memcached server port. Defaults to 11211 if not specified. */
  port?: number;

  /** Maximum buffer size for the Memcached client (in mb). Defaults to 10. */
  maxBufferSize?: number;

  /**
   * TLS configuration. Pass `true` for default TLS (system roots,
   * no client cert), or an {@link EngineSSLOptions} object for fine
   * control. Forwarded verbatim to the underlying `MemcachedEngine`.
   */
  ssl?: boolean | EngineSSLOptions;
};
