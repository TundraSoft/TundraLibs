/**
 * @fileoverview `idempotency` — safe client retries for non-idempotent
 * requests. A request carrying the idempotency header (default
 * `idempotency-key`) executes once; a retry with the same key replays
 * the FIRST attempt's stored reply (marked `idempotency-replayed: true`)
 * instead of re-running the handler, and a concurrent duplicate is
 * rejected 409 while the first attempt is still in flight. Records live
 * in an injected {@link Store} — per-process memory (bounded to
 * {@link IdempotencyOptions.maxRecords} entries) by default; hand over
 * redis/cacher closures to share keys across replicas.
 *
 * HTTP-only (SOCKET/JOB invocations pass through, as do unmatched
 * requests — a 404 has nothing to replay and its raw pathname would mint
 * unbounded keys). The record key is `ctx.action` (method + matched
 * route pattern) + the REQUIRED identity {@link IdempotencyOptions.scope}
 * + the client key, so the same client key on another endpoint — or from
 * another caller — is a different record, never a cross-route or
 * cross-user replay. `scope: false` opts into a deliberately shared key
 * space (a webhook receiver keyed by the provider's event id); a scope
 * returning `undefined` or `''` skips idempotency for that request (an
 * anonymous caller gets no replay, never someone else's).
 *
 * What a replay carries: the first attempt's `content`, `status`, and
 * the response headers its INNER chain added or changed (measured
 * against a pre-`next()` snapshot — per-request stamps like the
 * request-id echo are re-issued fresh, never resurrected). The record
 * is a WIRE-FAITHFUL snapshot (data replies round-trip through JSON, so
 * `toJSON` projections are honored; bytes are copied) taken at store
 * time and cloned again per replay — later in-place mutation of the
 * live reply can never leak into (or out of) the store, and a replay
 * serializes the same bytes the first attempt sent. A reply `redirect`
 * survives as its interpreted status + `location`. NOT replayed:
 * `set-cookie` (a cookie is per-request state — don't put a login
 * behind an idempotency key) and STREAMED or otherwise un-serializable
 * bodies, which cannot be re-sent from a store — those pass through
 * un-recorded (the key is released, a retry re-executes). A THROWN
 * error is never recorded either: the key is released and the retry
 * re-executes.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { HTTPContext } from '../context/mod.ts';
import type {
  RapidContextResponse,
  RapidContextState,
  RapidMiddleware,
} from '../types/mod.ts';
import { isStreamBody } from '../utils/streams.ts';
import { isThenable } from '../utils/isThenable.ts';
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
   * Who a key belongs to — REQUIRED, because a key without an identity
   * replays one caller's stored response to anyone who guesses (or
   * sniffs) the header. Return a stable caller identity (auth subject,
   * session id, API-key id); `undefined` or `''` skips idempotency for
   * that request (no identity → no replay — a blank header value must
   * not become a shared key space). Pass `false` — an explicit
   * opt-out, never a default — for a deliberately shared key space, e.g.
   * a webhook receiver keyed by the provider's event id.
   */
  scope:
    | ((
      ctx: HTTPContext<RapidContextState>,
    ) => string | undefined | Promise<string | undefined>)
    | false;
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
   * passes through untouched; a key longer than 255 characters is
   * rejected 400 (RAPID_VALIDATION_FAILED) — keys are opaque tokens, not
   * payloads.
   * @default 'idempotency-key'
   */
  header?: string;
  /**
   * Cap on the default in-memory store's live records, oldest-first
   * evicted beyond it — the bound that keeps attacker-minted keys from
   * growing the process for `ttlMs` (an evicted COMPLETED record just
   * means that retry re-executes; in-flight `pending` markers are never
   * evicted, so the 409 guarantee holds even under key pressure —
   * exceeding the bound transiently instead). Ignored when `store` is
   * injected: bound the shared store yourself (redis maxmemory, cacher
   * limits).
   * @default 10_000
   */
  maxRecords?: number;
  /**
   * Record backend. With a SYNCHRONOUS store (the default) the
   * check-and-claim runs without an await gap, so two concurrent
   * duplicates can never both claim the key; an async (shared) store
   * narrows but cannot fully close that window unless it provides
   * atomic writes.
   * @default an in-process {@link memoryStore} bounded to `maxRecords`
   */
  store?: Store<IdempotencyRecord>;
};

/** Longest accepted client key — beyond it the request is rejected 400. */
const MAX_KEY_LENGTH = 255;

/** Default bound on the in-memory store's live records. */
const DEFAULT_MAX_RECORDS = 10_000;

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

/**
 * Release a claimed key so a retry re-executes (delete, or ~instant
 * expiry). Awaitable and never-throwing: a store outage here must not
 * mask the error being rethrown (the pending marker expires on its own),
 * and an un-observed rejection would be process-fatal.
 */
async function release(
  store: Store<IdempotencyRecord>,
  key: string,
): Promise<void> {
  try {
    if (store.delete !== undefined) await store.delete(key);
    else await store.set(key, { state: 'pending' }, 1);
  } catch {
    // swallowed — pendingTtlMs expires the marker regardless
  }
}

/**
 * A WIRE-FAITHFUL copy of a reply's content for the record: strings are
 * immutable, bytes are copied, and DATA round-trips through JSON — the
 * same projection respond() applies — so a replay serializes the exact
 * bytes of the first attempt. (`structuredClone` here would be a LEAK:
 * it keeps hidden own fields while dropping the `toJSON` that hides
 * them, so a replay could ship what the first response projected away.)
 * Throws on unserializable content (circular, a throwing `toJSON`) —
 * the caller treats that like a stream: un-recordable.
 */
function snapshotContent(
  content: RapidContextResponse['content'],
): RapidContextResponse['content'] {
  if (typeof content === 'string') return content;
  if (content instanceof Uint8Array) return content.slice();
  return JSON.parse(JSON.stringify(content));
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
 * store without reaching inner middleware or the handler. Note the
 * `scope` callback IS reached on a replay (it builds the key), so keep
 * it cheap and side-effect free.
 *
 * @throws {RapidError} RAPID_CONFIG when `scope` is missing, or when
 *   `ttlMs`/`pendingTtlMs`/`maxRecords` are not positive integers
 *   (factory time).
 * @throws {RapidError} RAPID_VALIDATION_FAILED (400) when the client key
 *   exceeds 255 characters.
 * @throws {RapidError} RAPID_CONFLICT (409) as a rejection of the
 *   middleware's promise when the key's first attempt is still in
 *   flight.
 *
 * @example
 * ```ts ignore
 * import { getSession, idempotency, session } from '@tundralibs/rapid/middlewares';
 *
 * app.use(session());
 * app.use(idempotency({
 *   scope: async (ctx) => (await getSession(ctx))?.id, // per-caller keys
 * }));
 * // curl -H 'idempotency-key: order-42' ...
 * ```
 */
export function idempotency(options: IdempotencyOptions): RapidMiddleware {
  const scope = options?.scope;
  if (scope === undefined) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'idempotency requires a scope — return a caller identity ' +
        '(session id / auth subject / API-key id), or pass scope: false ' +
        'for a deliberately shared key space',
    });
  }
  const ttlMs = options.ttlMs ?? 86_400_000;
  const pendingTtlMs = options.pendingTtlMs ?? 60_000;
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  for (
    const [name, value] of [
      ['ttlMs', ttlMs],
      ['pendingTtlMs', pendingTtlMs],
      ['maxRecords', maxRecords],
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
  const store = options.store ?? memoryStore<IdempotencyRecord>({
    maxEntries: maxRecords,
    // A pending marker is an in-flight attempt's claim — evicting one
    // would let a concurrent duplicate execute a second time instead of
    // 409ing. Only completed records may make room.
    evictable: (record) => record.state !== 'pending',
  });

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP') return next();
    const clientKey = ctx.headers.get(header);
    if (clientKey === null || clientKey === '') return next();
    if (!ctx.matched) return next(); // a 404 has nothing to replay
    if (clientKey.length > MAX_KEY_LENGTH) {
      throw new RapidError('RAPID_VALIDATION_FAILED', {
        message:
          `${header} must be at most ${MAX_KEY_LENGTH} characters (an opaque token, not a payload)`,
      });
    }
    let scopeValue = '';
    if (scope !== false) {
      const identity = await scope(ctx);
      // '' is not an identity (an empty auth header, a blank claim) — it
      // must not fall into a shared key space; that is `scope: false`'s
      // EXPLICIT choice alone. No identity → no replay.
      if (identity === undefined || identity === '') return next();
      scopeValue = identity;
    }
    // NUL-separated: header values cannot carry \0, so a crafted key can
    // never collide across (action, scope) boundaries.
    const key = `${ctx.action}\u0000${scopeValue}\u0000${clientKey}`;

    const prior = await claim(store, key, pendingTtlMs);
    if (prior !== undefined) {
      if (prior.state === 'pending') {
        throw new RapidError('RAPID_CONFLICT', {
          message: 'A request with this idempotency key is already in flight',
          details: { header, key: clientKey },
        });
      }
      ctx.setHeader('idempotency-replayed', 'true');
      // Cloned per replay: a mutation by outer middleware on one replay
      // must not compound into the store or the next replay.
      ctx.response = prior.reply === null ? null : structuredClone(prior.reply);
      return; // replayed — short-circuit the chain
    }

    const before = ctx.responseHeaders; // snapshot (a copy) for the diff
    try {
      await next();
    } catch (error) {
      // Never record a throw — a retry re-executes. Awaited so an
      // immediate retry can't still find the pending marker.
      await release(store, key);
      throw error;
    }
    const reply = ctx.response;
    if (reply !== null && isStreamBody(reply.content)) {
      await release(store, key); // a stream cannot replay — don't pretend it can
      return;
    }
    let replayable: IdempotentReply | null = null;
    if (reply !== null) {
      let content: RapidContextResponse['content'];
      try {
        // Snapshotted at store time: the live reply object stays the
        // app's to mutate; the record is frozen at the WIRE form of what
        // the handler answered (see snapshotContent).
        content = snapshotContent(reply.content);
      } catch {
        await release(store, key); // un-serializable → un-replayable, like a stream
        return;
      }
      const added = headersAdded(before, ctx.responseHeaders);
      replayable = {
        content,
        ...(reply.status !== undefined ? { status: reply.status } : {}),
        ...(added !== undefined ? { headers: added } : {}),
      };
    }
    await store.set(key, { state: 'done', reply: replayable }, ttlMs);
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
