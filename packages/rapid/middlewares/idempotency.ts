/**
 * @fileoverview `idempotency` — safe client retries for non-idempotent
 * requests. A request carrying the idempotency header (default
 * `idempotency-key`) executes once; a retry with the same key replays
 * the FIRST attempt's stored reply (marked `idempotency-replayed: true`)
 * instead of re-running the handler, and a concurrent duplicate is
 * rejected 409 while the first attempt is still in flight. Records live
 * in an injected {@link Store} — per-process memory by default; hand
 * over redis/cacher closures to share keys across replicas.
 *
 * HTTP-only (SOCKET/JOB invocations pass through). The key is scoped to
 * `ctx.action` (method + matched route pattern), so the same client key
 * on a different endpoint is a different record, never a cross-route
 * replay.
 *
 * What a replay carries: the first attempt's `content`, `status`, and
 * the response headers its INNER chain added or changed (measured
 * against a pre-`next()` snapshot — per-request stamps like the
 * request-id echo are re-issued fresh, never resurrected). A reply
 * `redirect` survives as its interpreted status + `location`. NOT
 * replayed: `set-cookie` (a cookie is per-request state — don't put a
 * login behind an idempotency key) and STREAMED bodies, which cannot be
 * re-sent from a store — a stream passes through un-recorded (the key
 * is released, a retry re-executes). A THROWN error is never recorded
 * either: the key is released and the retry re-executes.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidContextResponse, RapidMiddleware } from '../types/mod.ts';
import { isStreamBody } from '../utils/streams.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';
import { memoryStore, type Store } from './store.ts';

/** The replayable slice of a completed reply (see the fileoverview). */
export type IdempotentReply = {
  content: RapidContextResponse['content'];
  status?: RapidContextResponse['status'];
  headers?: Record<string, string>;
};

/**
 * One key's record: `pending` while the first attempt runs, `done` with
 * the stored reply (`null` = the attempt answered with no body, a 204)
 * once it completed.
 */
export type IdempotencyRecord =
  | { state: 'pending' }
  | { state: 'done'; reply: IdempotentReply | null };

/** Options for {@link idempotency}. */
export type IdempotencyOptions = {
  /**
   * How long a completed reply stays replayable, in milliseconds.
   * @default 86_400_000 (24h)
   */
  ttlMs?: number;
  /**
   * How long the `pending` marker may block concurrent duplicates, in
   * milliseconds — the ceiling on how long a crashed-mid-flight attempt
   * can wedge its key (normal completion replaces the marker long
   * before).
   * @default 60_000
   */
  pendingTtlMs?: number;
  /**
   * The request header carrying the client's key. A request without it
   * passes through untouched.
   * @default 'idempotency-key'
   */
  header?: string;
  /**
   * Record backend. With a SYNCHRONOUS store (the default) the
   * check-and-claim runs without an await gap, so two concurrent
   * duplicates can never both claim the key; an async (shared) store
   * narrows but cannot fully close that window unless it provides
   * atomic writes.
   * @default an in-process {@link memoryStore}
   */
  store?: Store<IdempotencyRecord>;
};

const isThenable = (v: unknown): v is Promise<unknown> =>
  v !== null && typeof v === 'object' &&
  typeof (v as { then?: unknown }).then === 'function';

/**
 * Claim `key`: read the record and, when absent, write the `pending`
 * marker in the same tick (no await gap on a sync store). Returns the
 * PRIOR record — `undefined` means the claim succeeded and the caller
 * runs the handler.
 */
function claim(
  store: Store<IdempotencyRecord>,
  key: string,
  pendingTtlMs: number,
):
  | (IdempotencyRecord | undefined)
  | Promise<IdempotencyRecord | undefined> {
  const take = (
    current: IdempotencyRecord | undefined,
  ):
    | (IdempotencyRecord | undefined)
    | Promise<IdempotencyRecord | undefined> => {
    if (current !== undefined) return current;
    const set = store.set(key, { state: 'pending' }, pendingTtlMs);
    return isThenable(set) ? set.then(() => undefined) : undefined;
  };
  const got = store.get(key);
  return isThenable(got) ? got.then(take) : take(got);
}

/** Release a claimed key so a retry re-executes (delete, or ~instant expiry). */
function release(store: Store<IdempotencyRecord>, key: string): void {
  if (store.delete !== undefined) {
    void store.delete(key);
  } else {
    void store.set(key, { state: 'pending' }, 1);
  }
}

/**
 * The header diff: entries of `after` that `before` lacked or carried
 * with a different value — what the inner chain itself produced.
 * `set-cookie` is excluded by design (never replayed).
 */
function headersAdded(
  before: Headers,
  after: Headers,
): Record<string, string> | undefined {
  let added: Record<string, string> | undefined;
  for (const [name, value] of after.entries()) {
    if (name === 'set-cookie' || before.get(name) === value) continue;
    (added ??= {})[name] = value;
  }
  return added;
}

/**
 * Build the middleware. Register EARLY (outer), before anything that
 * must NOT re-run on a replay — a replayed request answers from the
 * store without reaching inner middleware or the handler.
 *
 * @throws {RapidError} RAPID_CONFIG when `ttlMs`/`pendingTtlMs` are not
 *   positive integers (factory time).
 * @throws {RapidError} RAPID_CONFLICT (409) as a rejection of the
 *   middleware's promise when the key's first attempt is still in
 *   flight.
 *
 * @example
 * ```ts ignore
 * import { idempotency } from '@tundralibs/rapid/middlewares';
 *
 * app.use(idempotency()); // curl -H 'idempotency-key: order-42' ...
 * ```
 */
export function idempotency(options: IdempotencyOptions = {}): RapidMiddleware {
  const ttlMs = options.ttlMs ?? 86_400_000;
  const pendingTtlMs = options.pendingTtlMs ?? 60_000;
  for (
    const [name, value] of [
      ['ttlMs', ttlMs],
      ['pendingTtlMs', pendingTtlMs],
    ] as const
  ) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RapidError('RAPID_CONFIG', {
        message: `idempotency ${name} must be a positive integer`,
        details: { [name]: value },
      });
    }
  }
  const header = options.header ?? 'idempotency-key';
  const store = options.store ?? memoryStore<IdempotencyRecord>();

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP') return next();
    const clientKey = ctx.headers.get(header);
    if (clientKey === null || clientKey === '') return next();
    const key = `${ctx.action} ${clientKey}`;

    const prior = await claim(store, key, pendingTtlMs);
    if (prior !== undefined) {
      if (prior.state === 'pending') {
        throw new RapidError('RAPID_CONFLICT', {
          message: 'A request with this idempotency key is already in flight',
          details: { header, key: clientKey },
        });
      }
      ctx.setHeader('idempotency-replayed', 'true');
      ctx.response = prior.reply === null ? null : { ...prior.reply };
      return; // replayed — short-circuit the chain
    }

    const before = ctx.responseHeaders; // snapshot (a copy) for the diff
    try {
      await next();
    } catch (error) {
      release(store, key); // never record a throw — a retry re-executes
      throw error;
    }
    const reply = ctx.response;
    if (reply !== null && isStreamBody(reply.content)) {
      release(store, key); // a stream cannot replay — don't pretend it can
      return;
    }
    const added = reply === null
      ? undefined
      : headersAdded(before, ctx.responseHeaders);
    const stored: IdempotencyRecord = {
      state: 'done',
      reply: reply === null ? null : {
        content: reply.content,
        ...(reply.status !== undefined ? { status: reply.status } : {}),
        ...(added !== undefined ? { headers: added } : {}),
      },
    };
    await store.set(key, stored, ttlMs);
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
