/**
 * @fileoverview `session()` — cookie-keyed, hook-backed per-client session
 * state, loaded LAZILY: the signed cookie is verified and the record
 * fetched only when the request actually touches the session (the first
 * `await getSession(ctx)`), and the save/rolling-refresh phase runs only
 * for touched sessions. A request that never reads the session — an
 * asset, `/healthz`, a session-free API route — costs ZERO store
 * round-trips and zero HMAC work. HTTP-only (a no-op on SOCKET/JOB).
 * The id is signed with `@tundralibs/crypt` HMAC, so a tampered cookie
 * is rejected. Two expiries: a rolling idle TTL and a hard absolute cap
 * — the idle window slides on requests that ACCESS the session, so real
 * activity keeps a user signed in while a css fetch does not.
 *
 * Persistence is a set of {@link SessionHooks} the app hands the
 * factory — pact-style: each hook has one purpose and one contract, so
 * a redis/cacher implementation is one command per hook. The bundled
 * {@link memorySessionHooks} is the per-process default.
 *
 * @module
 */
import { ulid } from '@tundralibs/id';
import type { Context } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';
import type { RapidContextState, RapidMiddleware } from '../types/mod.ts';
import {
  assertCookieConfig,
  signValue,
  verifySignedValue,
} from '../utils/cookies.ts';
import { expiringMap } from '../utils/expiringMap.ts';
import { meterAction } from '../utils/Meter.ts';
import { mark, SESSION_ISSUED } from '../utils/requestMarks.ts';

/** Arbitrary per-client data held in a session. */
export type SessionData = Record<string, unknown>;

/** The stored envelope — data plus the birth time (epoch MILLISECONDS) for the absolute cap. */
export type SessionRecord = { data: SessionData; createdAt: number };

/**
 * The persistence hooks `session()` calls — each may return a value or a
 * promise. `id` is the raw session id (never the signed cookie value);
 * `ttl` is in SECONDS.
 */
export type SessionHooks = {
  /** The record for `id`, or `undefined` when absent or expired. */
  getSession(
    id: string,
  ): SessionRecord | undefined | Promise<SessionRecord | undefined>;
  /** Store (or replace) the record, expiring `ttl` seconds from now. */
  saveSession(
    id: string,
    record: SessionRecord,
    ttl: number,
  ): void | Promise<void>;
  /** Drop the record (a no-op when absent) — logout, id rotation. */
  deleteSession(id: string): void | Promise<void>;
  /**
   * Extend a live record's expiry to `ttl` seconds from now WITHOUT
   * rewriting its value, so a read-only request never overwrites a
   * concurrent write. Optional: without it the middleware re-saves what
   * `getSession` returns now.
   */
  touchSession?(id: string, ttl: number): void | Promise<void>;
};

/** Options for {@link session}. The id cookie is signed with the app `secret`. */
export type SessionOptions = {
  /**
   * Bound on LIVE sessions in the memory default (ignored when `hooks` is
   * given) — the oldest is evicted past it, like `rateLimit`'s `maxKeys`.
   * @default 100000
   */
  maxSessions?: number;
  /**
   * Persistence. Inject redis/cacher-backed hooks for multi-replica
   * deployments (memory is per-process).
   * @default {@link memorySessionHooks}
   */
  hooks?: SessionHooks;
  /** Session-id cookie name. @default 'sid' */
  cookie?: string;
  /**
   * Idle expiry in SECONDS, refreshed each request while `rolling`; also
   * the id cookie's `Max-Age`. A positive integer, at most `absoluteTtl`.
   * @default 1800 (30 minutes)
   */
  idleTtl?: number;
  /**
   * Hard lifetime cap in SECONDS regardless of activity. A positive
   * integer.
   * @default 43200 (12 hours)
   */
  absoluteTtl?: number;
  /**
   * Slide the idle window (re-store + re-cookie) on every request that
   * TOUCHES the session, not just writes — keeps active users signed in
   * (an untouched request never loads the session, so it never slides).
   * Off → only a modified session persists. @default true
   */
  rolling?: boolean;
  /**
   * `SameSite` of the id cookie. `'None'` requires `secure` (browsers
   * drop a non-Secure SameSite=None cookie). @default 'Lax'
   */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** Set the cookie's `Secure` flag. @default true */
  secure?: boolean;
  /** Cookie path; must be absolute. @default '/' */
  path?: string;
};

/** The per-request session surface — retrieve it with {@link getSession}. */
export type RapidSession = {
  /**
   * The id loaded from a valid cookie, or `undefined` for a fresh
   * session — a new id is minted when the response is saved (after the
   * handler), so it stays `undefined` inside the handler that created it.
   */
  readonly id: string | undefined;
  /** Read a value. */
  get<T = unknown>(key: string): T | undefined;
  /** Write a value (marks the session dirty → persisted after the handler). */
  set(key: string, value: unknown): void;
  /** Remove a value (marks dirty). */
  delete(key: string): void;
  /** The keys currently held. */
  keys(): string[];
  /**
   * Mint a NEW id at save while KEEPING the data — call right after login to
   * defeat session fixation. The old record is evicted.
   */
  regenerate(): void;
  /** Drop the server record and clear the cookie — call on logout. */
  destroy(): void;
};

/** Per-process {@link SessionHooks} over an expiring map — the default. */
export function memorySessionHooks(
  options: { maxSessions?: number } = {},
): SessionHooks {
  // Bounded like the rateLimit/idempotency defaults: an anonymous visitor
  // whose handler writes to the session mints one record per request.
  const records = expiringMap<SessionRecord>({
    maxEntries: options.maxSessions ?? 100_000,
  });
  return {
    getSession: (id) => records.get(id),
    saveSession: (id, record, ttl) => records.set(id, record, ttl),
    deleteSession: (id) => records.delete(id),
    touchSession: (id, ttl) => records.touch(id, ttl),
  };
}

/** Symbol under which the lazy session loader rides the (per-request) ctx. */
const SESSION: unique symbol = Symbol('rapid.session');
type WithSession = { [SESSION]?: () => Promise<RapidSession> };

/**
 * The session for the current request — `await` it — or `undefined` when
 * {@link session} is not installed (or the invoke is not HTTP). The first
 * call verifies the cookie and loads the record (memoized per request);
 * a request that never calls this never touches the hooks. Stored on the
 * per-request context instance — never `ctx.state` (which is shared
 * under `stateMode: 'SHARE'`). `await getSession(ctx)` reads naturally
 * in both cases (awaiting `undefined` yields `undefined`).
 */
export function getSession<S extends RapidContextState = RapidContextState>(
  ctx: Context<S>,
): Promise<RapidSession> | undefined {
  return (ctx as unknown as WithSession)[SESSION]?.();
}

/**
 * Hook-backed session middleware. Install it once; read the session in a
 * handler with {@link getSession}.
 *
 * @throws {@link RapidError} `RAPID_CONFIG` at build when `idleTtl` /
 *   `absoluteTtl` are not positive integers, `idleTtl` exceeds
 *   `absoluteTtl`, or the cookie configuration is one a browser would
 *   reject (see `assertCookieConfig`); at request time (500) when the
 *   app has no `secret` — the signing key is read on the first
 *   session-touching request, not at boot.
 * @throws {@link RapidError} `RAPID_RESPONSE_INVALID` when the id cookie
 *   cannot be serialised (an `idleTtl` past the 400-day cookie cap).
 *   Injected hooks' rejections propagate as they are.
 *
 * @example
 * ```ts ignore
 * // The id cookie is signed with the app `secret` option — set that once.
 * app.use(session());
 * app.post('/login', async (ctx) => {
 *   const s = (await getSession(ctx))!;
 *   s.regenerate();               // new id, keep any anonymous data
 *   s.set('userId', await authenticate(ctx));
 *   return { content: { ok: true } };
 * });
 * ```
 */
export function session(options: SessionOptions = {}): RapidMiddleware {
  if (
    options.maxSessions !== undefined &&
    (!Number.isInteger(options.maxSessions) || options.maxSessions < 1)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'session maxSessions must be a positive integer',
      details: { maxSessions: options.maxSessions },
    });
  }
  const hooks = options.hooks ??
    memorySessionHooks({ maxSessions: options.maxSessions });
  const name = options.cookie ?? 'sid';
  const idleTtl = options.idleTtl ?? 1800;
  const absoluteTtl = options.absoluteTtl ?? 43_200;
  for (
    const [option, value] of [
      ['idleTtl', idleTtl],
      ['absoluteTtl', absoluteTtl],
    ] as const
  ) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `session ${option} must be a positive integer number of seconds`,
        details: { [option]: value },
      });
    }
  }
  // The cookie's Max-Age is idleTtl and the serializer refuses anything past
  // the 400-day browser cap — catch it here, not on the first request.
  if (idleTtl > 400 * 24 * 60 * 60) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        'session idleTtl must not exceed 400 days (the cookie lifetime cap)',
      details: { idleTtl },
    });
  }
  if (idleTtl > absoluteTtl) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `session idleTtl (${idleTtl}s) must not exceed absoluteTtl (${absoluteTtl}s)`,
      details: { idleTtl, absoluteTtl },
    });
  }
  assertCookieConfig('session', name, options);
  const absoluteMs = absoluteTtl * 1000;
  const rolling = options.rolling ?? true;

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP') return await next();

    // The dirty-tracked state, populated by the LAZY load below. Nothing
    // — not the HMAC verify, not the hook read — runs until the request
    // actually asks for its session.
    let id: string | undefined;
    let data: SessionData = {};
    let createdAt = Date.now();
    let dirty = false;
    let destroyed = false;
    let loaded = false; // only a COMPLETED load may reach the save phase
    let evict: string | undefined; // an old id to drop after regenerate()

    // LOAD — verify the signed id, fetch + validate the record, build the
    // wrapper. Memoized: every getSession() call shares one promise.
    const load = async (): Promise<RapidSession> => {
      const secret = ctx.app.secret;
      id = await verifySignedValue(ctx.cookies[name], secret, name);
      if (id !== undefined) {
        const rec = await hooks.getSession(id);
        if (rec !== undefined && Date.now() - rec.createdAt < absoluteMs) {
          // CLONED, never aliased: handing out the in-memory hooks' own
          // object would let in-place mutations persist even when the
          // save phase never runs — semantics a serializing (redis)
          // backend could not match.
          try {
            data = structuredClone(rec.data);
            createdAt = rec.createdAt;
          } catch {
            // An unclonable (corrupt / foreign-backend) record must not
            // 500 every request forever — degrade to a fresh session.
            id = undefined;
          }
        } else {
          id = undefined; // absent / past the absolute cap → start fresh, lazily
        }
      }
      loaded = true;
      ctx.meter?.middleware(
        'session',
        id !== undefined ? 'loaded' : 'missed',
        meterAction(ctx),
      );
      return {
        get id() {
          return id;
        },
        get: <T = unknown>(key: string) => data[key] as T | undefined,
        set: (key, value) => {
          data[key] = value;
          dirty = true;
        },
        delete: (key) => {
          delete data[key];
          dirty = true;
        },
        keys: () => Object.keys(data),
        regenerate: () => {
          ctx.meter?.middleware('session', 'regenerated', meterAction(ctx));
          if (id !== undefined) evict = id; // drop the pre-login record at save
          id = undefined; // new id minted at save
          createdAt = Date.now(); // fresh absolute window post-login
          dirty = true;
        },
        destroy: () => {
          ctx.meter?.middleware('session', 'destroyed', meterAction(ctx));
          destroyed = true;
        },
      };
    };
    let loading: Promise<RapidSession> | undefined;
    (ctx as unknown as WithSession)[SESSION] = () => (loading ??= load());

    // RUN — the SAVE phase runs whether or not the handler threw, so a
    // handler that calls destroy() (logout) or set() and THEN throws
    // still persists that intent; without it, logout-then-throw leaves
    // the user signed in. (Structured as catch-then-rethrow, not a
    // throwing `finally` — deno lint's no-unsafe-finally is right that
    // a finally-throw masks control flow.)
    let thrown = false;
    let handlerError: unknown;
    try {
      await next();
    } catch (error) {
      thrown = true;
      handlerError = error;
    }
    {
      try {
        // SAVE — only for a TOUCHED session (loading set), and only when
        // something changed (or rolling slides the window). An un-awaited
        // getSession() (a handler that fired and forgot) still settles
        // here before the state is read, so a half-loaded session can't
        // save.
        if (loading !== undefined) {
          await loading.catch(() => {});
          // `loaded` gates everything: a load that FAILED mid-way (a
          // transient read error) may have verified `id` already —
          // saving then would overwrite the live record with an empty
          // one and re-issue the cookie, erasing the session over a
          // blip. A failed load saves nothing.
          const issue = async (sid: string): Promise<void> => {
            const signed = await signValue(sid, ctx.app.secret, name);
            ctx.setCookie(name, signed, {
              httpOnly: true,
              secure: options.secure ?? true,
              sameSite: options.sameSite ?? 'Lax',
              path: options.path ?? '/',
              maxAge: idleTtl,
            });
            // For an OUTER csrf(): the binding this response's cookie
            // carries, so it can re-bind its token on the same response.
            mark(ctx, SESSION_ISSUED, signed);
          };
          if (loaded && destroyed) {
            // regenerate() then destroy(): the pre-rotation record must
            // die too, or the fixation window survives the logout.
            if (evict !== undefined) await hooks.deleteSession(evict);
            if (id !== undefined) await hooks.deleteSession(id);
            ctx.deleteCookie(name, { path: options.path ?? '/' });
            mark(ctx, SESSION_ISSUED, '');
          } else if (loaded && dirty) {
            const fresh = id === undefined;
            id ??= ulid();
            if (evict !== undefined && evict !== id) {
              await hooks.deleteSession(evict);
            }
            // CLONED at save too: (a) the in-memory hooks must hold a
            // snapshot, not an alias of the live `data` (a post-response
            // mutation must not persist); (b) a value no backend could
            // serialize (a function) fails THIS request loudly instead
            // of poisoning the record and wedging every later load.
            ctx.meter?.middleware('session', 'saved', meterAction(ctx));
            await hooks.saveSession(
              id,
              { data: structuredClone(data), createdAt },
              idleTtl,
            );
            // Issue on a fresh/rotated id; re-issue to slide the rolling
            // window.
            if (fresh || rolling) await issue(id);
          } else if (loaded && id !== undefined && rolling) {
            // A READ-ONLY request slides the window WITHOUT rewriting the
            // record: its snapshot may be older than a write that landed
            // in parallel (a page render overlapping a POST), and saving
            // it back would erase that write. `touchSession` when the
            // hooks have it; else re-save whatever the backend holds NOW.
            ctx.meter?.middleware('session', 'touched', meterAction(ctx));
            if (hooks.touchSession !== undefined) {
              await hooks.touchSession(id, idleTtl);
            } else {
              const current = await hooks.getSession(id);
              if (current !== undefined) {
                await hooks.saveSession(id, current, idleTtl);
              }
            }
            await issue(id);
          }
        }
      } catch (error) {
        // A hook failure in SAVE surfaces as the request's error — unless
        // the handler already threw; the original error wins.
        if (!thrown) throw error;
      }
    }
    if (thrown) throw handlerError;
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
