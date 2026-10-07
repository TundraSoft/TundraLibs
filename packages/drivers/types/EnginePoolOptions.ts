/**
 * Pool configuration options for a driver engine.
 *
 * @module
 */

export type EnginePoolOptions = {
  /** Minimum number of resources to keep warm in the pool. Default: 0. */
  min?: number;
  /** Maximum number of resources the pool will hold. Default: 10. */
  max?: number;
  /**
   * Time in seconds an idle resource may sit in the pool before being closed.
   * Resources will not be evicted if doing so would drop pool size below `min`.
   * Default: 180.
   */
  idleTimeoutSeconds?: number;
  /**
   * Most idle resources the pool keeps. A resource released while this
   * many already sit idle is closed instead. `0` closes every resource on
   * release — a connection per acquire, for Cloudflare Workers (a socket
   * cannot outlive the request that opened it) behind Hyperdrive, which
   * pools the real database connections itself. Must lie between `min` and
   * `max`. Elsewhere it trades reuse for a fresh connect on every query;
   * to close connections after a quiet spell, use `idleTimeoutSeconds`.
   * Only drivers with a socket pool accept it.
   * Default: `max`.
   */
  maxIdle?: number;
  /**
   * Default time in seconds an `acquire()` call will wait for a resource
   * before rejecting with a timeout error. Set to 0 to wait indefinitely.
   * Default: 30.
   */
  acquireTimeoutSeconds?: number;
};
