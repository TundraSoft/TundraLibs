/**
 * Reconnect policy for the `Client`.
 *
 * When enabled, the Client transparently reattempts the connection
 * after an unexpected close (anything other than an explicit
 * `client.close()`), using exponential backoff up to
 * `maxAttempts`. Active subscriptions are automatically restored
 * on reconnect; in-flight `command()` calls reject with
 * `CONNECTION_LOST`.
 */
export type ReconnectPolicy = {
  /** Enable auto-reconnect. Default: `true`. */
  enabled?: boolean;
  /** Max reconnect attempts before giving up. Default: `10`. */
  maxAttempts?: number;
  /** First retry delay in ms. Default: `500`. */
  initialDelayMs?: number;
  /** Multiplier per attempt. Default: `2`. */
  backoffFactor?: number;
  /** Maximum delay between attempts in ms. Default: `30_000`. */
  maxDelayMs?: number;
};
