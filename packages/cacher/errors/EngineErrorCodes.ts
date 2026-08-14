/**
 * @module
 *
 * Error code → message-template registry shared by every cacher engine.
 * An engine maps its failure to one of these codes so callers branch on
 * `error.code` instead of parsing message text. Templates use `${var}`
 * placeholders filled from the error's metadata when the message is
 * built.
 *
 * Every {@link CacherEngineError} meta carries `name` (the cacher
 * instance name) and `engine` (e.g. `'REDIS'`, `'MEMCACHED'`,
 * `'MEMORY'`); the per-code comments below name the *additional*
 * variables that code's template consumes.
 *
 * Codes are additive — new ones may be appended, existing ones are
 * never renamed or repurposed. Several codes exist for custom engines
 * to use and are not raised by any built-in engine today; those are
 * marked below. `Cacher-Errors.md`, alongside this file, carries the
 * same table in prose form.
 */

/**
 * Registry mapping each {@link CacherEngineErrorCode} to its message
 * template. Passed to the {@link CacherEngineError} constructor, which
 * falls back to `UNKNOWN_ERROR` (preserving the supplied string on
 * `meta.originalCode`) when it is handed a code that is not a key here.
 */
export const CacherEngineErrorCodes = {
  /**
   * Fallback for a code that is not in this registry. Never passed
   * deliberately — the `CacherEngineError` constructor coerces to it
   * and stores the unrecognised string on `meta.originalCode`.
   *
   * Variables: none.
   */
  UNKNOWN_ERROR: 'Unknown error occurred',
  //#region Configuration Errors
  /**
   * The configuration object as a whole is malformed — not merely one
   * bad key. Provided for custom engines; **no built-in engine raises
   * it** (they report per-key problems as `CONFIG_MISSING` /
   * `CONFIG_INVALID`).
   *
   * Variables: none.
   */
  CONFIG_MALFORMED: 'Configuration is malformed',
  /**
   * A required configuration key was absent. Raised while options are
   * being validated, before any connection is attempted — Redis
   * without a `host`, or with only one half of the `username` /
   * `password` pair; Memcached without a `host`.
   *
   * Variables: `configKey` (the missing key). Some sites also set
   * `reason`, which this template does not interpolate.
   */
  CONFIG_MISSING: 'Configuration key ${configKey} is missing',
  /**
   * A configuration value was present but failed validation — a
   * non-positive `port`, a negative `db`, a `defaultExpiry` outside
   * 0–2592000 seconds, or an empty cacher `name`. Fix the option; the
   * engine cannot be constructed until you do.
   *
   * Variables: `configKey` (the offending key), `reason` (why it is
   * invalid).
   */
  CONFIG_INVALID: 'Configuration value for ${configKey} is invalid: ${reason}',
  //#endregion Configuration Errors

  //#region Connection Errors
  /**
   * The engine could not establish its connection. Raised by the Redis
   * and Memcached engines when the underlying driver's `connect()`
   * throws — the driver's own error rides on `cause`, and its message
   * is copied onto `reason`.
   *
   * Variables: `reason` (the underlying failure). The meta also
   * carries `host` / `port` for diagnostics.
   */
  CONNECTION_FAILED: 'Failed to connect to ${engine}: ${reason}',
  /**
   * A connection attempt exceeded its time budget. Provided for custom
   * engines; **no built-in engine raises it** — a timeout surfacing
   * from the underlying driver arrives as `CONNECTION_FAILED` with the
   * driver's message on `reason`.
   *
   * Variables: `timeout` (the elapsed budget, in milliseconds).
   */
  CONNECTION_TIMEOUT: 'Connection to ${engine} timed out after ${timeout}ms',
  /**
   * The server actively refused the connection. Provided for custom
   * engines; **no built-in engine raises it** — a refusal arrives as
   * `CONNECTION_FAILED`.
   *
   * Variables: none.
   */
  CONNECTION_REFUSED: 'Connection to ${engine} was refused',
  /**
   * An established connection dropped. Provided for custom engines;
   * **no built-in engine raises it** — a mid-operation drop surfaces
   * as `OPERATION_FAILED` for the operation that hit it.
   *
   * Variables: none.
   */
  CONNECTION_LOST: 'Connection to ${engine} was lost',
  /**
   * Authentication was rejected by the cache server. Provided for
   * custom engines; **no built-in engine raises it** — Redis auth
   * failures arrive as `CONNECTION_FAILED` with the server's message
   * on `reason`.
   *
   * Variables: none.
   */
  CONNECTION_INVALID_CREDENTIALS: 'Invalid credentials for ${engine}',
  //#endregion Connection Errors

  //#region Operation Errors
  /**
   * The engine has no implementation for the requested operation.
   * Provided for custom engines that support only part of the cacher
   * surface; **no built-in engine raises it**.
   *
   * Variables: `operation` (the unsupported operation name).
   */
  OPERATION_NOT_SUPPORTED:
    'Operation ${operation} is not supported in ${engine}',
  /**
   * A cache operation failed at runtime. The catch-all the Redis and
   * Memcached engines use when the underlying driver throws during
   * `GET` / `SET` / `DELETE` / `HAS` / `CLEAR`; the driver's error is
   * attached as `cause`.
   *
   * Variables: `operation` (the operation that failed), `reason` (the
   * underlying message). The meta also carries `key` for keyed
   * operations.
   */
  OPERATION_FAILED: 'Operation ${operation} failed: ${reason}',
  /**
   * The arguments handed to an operation are unusable — raised by
   * `AbstractEngine` before the call reaches the engine, for an
   * `expiry` outside 0–2592000 seconds or a value that is not
   * JSON-serialisable (`undefined`, a function, a symbol). A caller
   * bug: fix the arguments rather than retry.
   *
   * Variables: `operation` (always `'SET'` today), `reason` (which
   * argument is wrong). The meta also carries `key`.
   */
  OPERATION_INVALID_PARAMS:
    'Invalid parameters for operation ${operation}: ${reason}',
  /**
   * The credentials in use lack permission for the operation.
   * Provided for custom engines; **no built-in engine raises it** — a
   * server-side permission refusal arrives as `OPERATION_FAILED` with
   * the server's message on `reason`.
   *
   * Variables: `operation` (the refused operation name).
   */
  OPERATION_PERMISSION_DENIED: 'Permission denied for operation ${operation}',
  //#endregion Operation Errors
} as const;

/**
 * Union of every valid {@link CacherEngineErrorCodes} key — the type of
 * `CacherEngineError.code`. Branch on it instead of matching message
 * text; the strings are stable across releases.
 */
export type CacherEngineErrorCode = keyof typeof CacherEngineErrorCodes;
