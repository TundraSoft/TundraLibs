/**
 * @fileoverview A timer plus an optional caller `AbortSignal` that
 * rejects every promise guarded under it once either fires.
 *
 * @module
 */

import {
  ImapConnectionError,
  ImapTimeoutError,
  MailError,
} from '../errors/mod.ts';

/**
 * Bounds one operation. `guard()` races a promise against the deadline;
 * when the deadline fires first, `onExpire` runs once (the client closes
 * the socket there) and every guarded promise rejects. Always
 * `dispose()` in a `finally` so the timer is cleared.
 *
 * @internal
 */
export class Deadline {
  private __error?: MailError;
  private readonly __timer: ReturnType<typeof setTimeout>;
  private readonly __waiters = new Set<(e: MailError) => void>();
  private readonly __onAbort = () => {
    const reason = this.__signal?.reason;
    this.__fail(
      new ImapConnectionError(
        this.__operation,
        'aborted',
        reason instanceof Error ? reason : undefined,
      ),
    );
  };

  constructor(
    private readonly __operation: string,
    ms: number,
    private readonly __signal: AbortSignal | undefined,
    private readonly __onExpire: () => void,
  ) {
    this.__timer = setTimeout(
      () => this.__fail(new ImapTimeoutError(__operation, ms)),
      ms,
    );
    if (__signal?.aborted) this.__onAbort();
    else __signal?.addEventListener('abort', this.__onAbort, { once: true });
  }

  guard<T>(promise: Promise<T>): Promise<T> {
    if (this.__error) {
      promise.catch(() => {});
      return Promise.reject(this.__error);
    }
    return new Promise<T>((resolve, reject) => {
      this.__waiters.add(reject);
      promise.then(
        (v) => {
          this.__waiters.delete(reject);
          resolve(v);
        },
        (e) => {
          this.__waiters.delete(reject);
          reject(e);
        },
      );
    });
  }

  dispose(): void {
    clearTimeout(this.__timer);
    this.__signal?.removeEventListener('abort', this.__onAbort);
  }

  private __fail(error: MailError): void {
    if (this.__error) return;
    this.__error = error;
    this.__onExpire();
    for (const reject of this.__waiters) reject(error);
    this.__waiters.clear();
  }
}
