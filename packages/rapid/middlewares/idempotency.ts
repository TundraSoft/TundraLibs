/**
 * @fileoverview `idempotency` — safe client retries for non-idempotent
 * requests. A request carrying the idempotency header (default
 * `idempotency-key`) executes once; a retry with the same key replays
 * the FIRST attempt's stored reply (marked by the replayed header)
 * instead of re-running the handler, and a concurrent duplicate is
 * rejected 409 while the first attempt is still in flight. A key reused
 * for a DIFFERENT request — another method, path or body — is a 422, as
 * the IETF `Idempotency-Key` draft requires: every attempt is
 * fingerprinted (sha-256 over method, path and the raw body) and the
 * fingerprint travels with the record.
 *
 * Records live behind {@link IdempotencyHooks} — pact-style hooks, one
 * purpose each: `getRecord`, an atomic set-if-absent `claim`,
 * `saveRecord`, `release`. The bundled {@link memoryIdempotencyHooks}
 * (per-process, bounded to `maxRecords`) is the default; hand over redis
 * (`SET NX EX`) or cacher closures to share keys across replicas.
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
import { expiringMap } from '../utils/expiringMap.ts';
import { meterAction } from '../utils/Meter.ts';
import { isStreamBody } from '../utils/streams.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** The replayable slice of a completed reply (see the fileoverview). */
export type IdempotentReply = {
  content: RapidContextResponse['content'];
  status?: RapidContextResponse['status'];
  headers?: Record<string, string>;
};

/**
 * One key's record: `pending` while the first attempt runs, `done` with
 * the stored reply (`null` = the attempt answered with no body, a 204)
 * once it completed. `fingerprint` identifies the request the key was
 * first used for — a later attempt must match it.
 */
export type IdempotencyRecord =
  | { state: 'pending'; fingerprint: string }
  | { state: 'done'; fingerprint: string; reply: IdempotentReply | null };

/**
 * The persistence hooks `idempotency()` calls — each may return a value
 * or a promise; `ttl` is in SECONDS.
 */
export type IdempotencyHooks = {
  /** The record for `key`, or `undefined` when absent or expired. */
  getRecord(
    key: string,
  ): IdempotencyRecord | undefined | Promise<IdempotencyRecord | undefined>;
  /**
   * Store the `pending` marker ONLY IF no live record exists (redis
   * `SET NX EX`), returning whether this call stored it. Atomicity here
   * is what makes a concurrent duplicate a 409 rather than a second
   * execution — across replicas too.
   */
  claim(
    key: string,
    record: Extract<IdempotencyRecord, { state: 'pending' }>,
    ttl: number,
  ): boolean | Promise<boolean>;
  /** Store (or replace) the completed record, expiring `ttl` seconds from now. */
  saveRecord(
    key: string,
    record: IdempotencyRecord,
    ttl: number,
  ): void | Promise<void>;
  /** Drop the record so a retry re-executes (a no-op when absent). */
  release(key: string): void | Promise<void>;
};

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
   * How long a completed reply stays replayable, in SECONDS.
   * @default 86400 (24 hours)
   */
  ttl?: number;
  /**
   * How long the `pending` marker may block concurrent duplicates, in
   * SECONDS — the ceiling on how long a crashed-mid-flight attempt can
   * wedge its key (normal completion replaces the marker long before).
   * @default 60
   */
  pendingTtl?: number;
  /**
   * The request header carrying the client's key. A request without it
   * passes through untouched; a key longer than 255 characters is
   * rejected 400 (`RAPID_IDEMPOTENCY_KEY_INVALID`) — keys are opaque
   * tokens, not payloads.
   * @default 'idempotency-key'
   */
  header?: string;
  /**
   * The response header marking a replayed reply (`true`).
   * @default 'idempotency-replayed'
   */
  replayedHeader?: string;
  /**
   * Cap on the default in-memory hooks' live records, oldest-first
   * evicted beyond it — the bound that keeps attacker-minted keys from
   * growing the process for `ttl` (an evicted COMPLETED record just
   * means that retry re-executes; in-flight `pending` markers are never
   * evicted, so the 409 guarantee holds even under key pressure —
   * exceeding the bound transiently instead). Ignored when `hooks` are
   * injected: bound the shared store yourself (redis maxmemory, cacher
   * limits).
   * @default 10_000
   */
  maxRecords?: number;
  /**
   * Record persistence. With the SYNCHRONOUS default the claim runs
   * without an await gap; an injected backend must make `claim` atomic
   * itself (`SET NX`).
   * @default {@link memoryIdempotencyHooks} bounded to `maxRecords`
   */
  hooks?: IdempotencyHooks;
};

/** Longest accepted client key — beyond it the request is rejected 400. */
const MAX_KEY_LENGTH = 255;

/** Default bound on the in-memory hooks' live records. */
const DEFAULT_MAX_RECORDS = 10_000;

/** RFC 9110 header-name token. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Per-process {@link IdempotencyHooks}: synchronous (so `claim` is
 * atomic), bounded to `maxRecords`, never evicting a `pending` marker.
 *
 * @throws {RapidError} RAPID_CONFIG when `maxRecords` is not a positive
 *   integer.
 */
export function memoryIdempotencyHooks(
  options: { maxRecords?: number } = {},
): IdempotencyHooks {
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  if (!Number.isInteger(maxRecords) || maxRecords < 1) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'idempotency maxRecords must be a positive integer',
      details: { maxRecords },
    });
  }
  const records = expiringMap<IdempotencyRecord>({
    maxEntries: maxRecords,
    // A pending marker is an in-flight attempt's claim — evicting one
    // would let a concurrent duplicate execute a second time instead of
    // 409ing. Only completed records may make room.
    evictable: (record) => record.state !== 'pending',
  });
  return {
    getRecord: (key) => records.get(key),
    claim: (key, record, ttl) => records.setIfAbsent(key, record, ttl),
    saveRecord: (key, record, ttl) => records.set(key, record, ttl),
    release: (key) => records.delete(key),
  };
}

/**
 * The request's identity for the key: sha-256 over method, path and the
 * raw body bytes — a retry is the same request only when all three match.
 */
async function fingerprintOf(
  ctx: HTTPContext<RapidContextState>,
): Promise<string> {
  const body = (await ctx.rawPayload) ?? new Uint8Array();
  const head = new TextEncoder().encode(
    `${ctx.method}\n${new URL(ctx.url).pathname}\n`,
  );
  const bytes = new Uint8Array(head.length + body.length);
  bytes.set(head);
  bytes.set(body, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Release a claimed key so a retry re-executes. Awaitable and
 * never-throwing: a store outage here must not mask the error being
 * rethrown (the pending marker expires on its own), and an un-observed
 * rejection would be process-fatal.
 */
async function release(hooks: IdempotencyHooks, key: string): Promise<void> {
  try {
    await hooks.release(key);
  } catch {
    // swallowed — pendingTtl expires the marker regardless
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
 * it cheap and side-effect free. The fingerprint reads the raw body
 * (`ctx.rawPayload`), so register this before anything else that parses
 * the body. With `timeout()` in the chain (either order) a deadline that
 * fires leaves the handler running detached while the request already
 * failed with a 504 — the key then stays PENDING (a retry is a 409,
 * never a second execution) until `pendingTtl` expires it; size
 * `pendingTtl` above the handler's worst case.
 *
 * @throws {RapidError} RAPID_CONFIG when `scope` is missing, when
 *   `ttl`/`pendingTtl` (or `maxRecords`, when the memory hooks are in
 *   use) are not positive integers, or when a header name is not a
 *   token (factory time).
 * @throws {RapidError} RAPID_PAYLOAD_TOO_LARGE (413) as a rejection when
 *   the body read for the fingerprint exceeds the byte cap.
 * @throws {RapidError} RAPID_IDEMPOTENCY_KEY_INVALID (400) when the client
 *   key exceeds 255 characters.
 * @throws {RapidError} RAPID_IDEMPOTENCY_IN_FLIGHT (409) as a rejection of
 *   the middleware's promise when the key's first attempt is still in
 *   flight.
 * @throws {RapidError} RAPID_IDEMPOTENCY_MISMATCH (422) when the key was
 *   first used for a different request (method, path or body differ).
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
  const ttl = options.ttl ?? 86_400;
  const pendingTtl = options.pendingTtl ?? 60;
  for (
    const [name, value] of [['ttl', ttl], ['pendingTtl', pendingTtl]] as const
  ) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RapidError('RAPID_CONFIG', {
        message: `idempotency ${name} must be a positive integer`,
        details: { [name]: value },
      });
    }
  }
  const header = options.header ?? 'idempotency-key';
  const replayedHeader = options.replayedHeader ?? 'idempotency-replayed';
  for (
    const [name, value] of [
      ['header', header],
      ['replayedHeader', replayedHeader],
    ] as const
  ) {
    if (!TOKEN.test(value)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `idempotency ${name} '${value}' is not a valid header name`,
        details: { [name]: value },
      });
    }
  }
  const hooks = options.hooks ??
    memoryIdempotencyHooks({ maxRecords: options.maxRecords });

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP') return next();
    const clientKey = ctx.headers.get(header);
    if (clientKey === null || clientKey === '') return next();
    if (!ctx.matched) return next(); // a 404 has nothing to replay
    if (clientKey.length > MAX_KEY_LENGTH) {
      throw new RapidError('RAPID_IDEMPOTENCY_KEY_INVALID', {
        message:
          `${header} must be at most ${MAX_KEY_LENGTH} characters (an opaque token, not a payload)`,
        details: { header, maxLength: MAX_KEY_LENGTH },
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
    // never collide across (surface, action, scope) boundaries. The
    // surface is part of the identity: one route replays a JSON reply on
    // the api surface and a fragment on the ui surface.
    const key =
      `${ctx.surface}\u0000${ctx.action}\u0000${scopeValue}\u0000${clientKey}`;
    const fingerprint = await fingerprintOf(ctx);

    let prior = await hooks.getRecord(key);
    if (prior === undefined) {
      const owned = await hooks.claim(
        key,
        { state: 'pending', fingerprint },
        pendingTtl,
      );
      // Lost the claim to a concurrent duplicate: read what it stored.
      if (!owned) prior = await hooks.getRecord(key);
    }
    if (prior !== undefined) {
      if (prior.fingerprint !== fingerprint) {
        ctx.meter?.middleware('idempotency', 'mismatch', meterAction(ctx));
        throw new RapidError('RAPID_IDEMPOTENCY_MISMATCH', {
          details: { header, key: clientKey },
        });
      }
      if (prior.state === 'pending') {
        ctx.meter?.middleware('idempotency', 'in_flight', meterAction(ctx));
        throw new RapidError('RAPID_IDEMPOTENCY_IN_FLIGHT', {
          details: { header, key: clientKey },
        });
      }
      ctx.meter?.middleware('idempotency', 'replayed', meterAction(ctx));
      ctx.setHeader(replayedHeader, 'true');
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
      // immediate retry can't still find the pending marker. EXCEPT when
      // the work may still be running: an INNER `timeout()` rejects
      // RAPID_TIMEOUT while the handler continues detached, and an OUTER
      // one has already sent the 504 (`ctx.responded`) by the time the
      // detached chain rejects back here. Releasing in either case would
      // let the retry run the charge a second time — the pending marker
      // stands (a retry gets an honest 409) until `pendingTtl`.
      if (
        !ctx.responded && RapidError.from(error).code !== 'RAPID_TIMEOUT'
      ) {
        ctx.meter?.middleware('idempotency', 'released', meterAction(ctx));
        await release(hooks, key);
      }
      throw error;
    }
    // Answered by an OUTER middleware (`timeout()`'s 504) while the work was
    // still running: the late reply must not be recorded — the context's
    // status is already the 504, so the record would replay a poisoned
    // reply — and the marker must not be released either (the work ran;
    // a retry would run it twice). It stays pending until `pendingTtl`.
    if (ctx.responded) return;
    const reply = ctx.response;
    if (reply !== null && isStreamBody(reply.content)) {
      await release(hooks, key); // a stream cannot replay — don't pretend it can
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
        await release(hooks, key); // un-serializable → un-replayable, like a stream
        return;
      }
      const added = headersAdded(before, ctx.responseHeaders);
      replayable = {
        content,
        ...(reply.status !== undefined ? { status: reply.status } : {}),
        ...(added !== undefined ? { headers: added } : {}),
      };
    }
    await hooks.saveRecord(
      key,
      { state: 'done', fingerprint, reply: replayable },
      ttl,
    );
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
