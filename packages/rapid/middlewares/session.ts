/**
 * @fileoverview `session()` — cookie-keyed, store-backed per-client session
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
 * @module
 */
import { ulid } from '@tundralibs/id';
import type { Context } from '../context/mod.ts';
import type { RapidContextState, RapidMiddleware } from '../types/mod.ts';
import { signValue, verifySignedValue } from '../utils/cookies.ts';
import { memoryStore, type Store } from './store.ts';

/** Arbitrary per-client data held in a session. */
export type SessionData = Record<string, unknown>;

/** The stored envelope — data plus the birth time for the absolute cap. */
type SessionRecord = { data: SessionData; createdAt: number };

/** Options for {@link session}. The id cookie is signed with the app `secret`. */
export type SessionOptions = {
  /**
   * Record backend; defaults to {@link memoryStore}. Inject a redis/cacher
   * `Store` for multi-replica deployments (memory is per-process).
   */
  store?: Store<SessionRecord>;
  /** Session-id cookie name. @default 'sid' */
  cookie?: string;
  /** Idle expiry in ms, refreshed each request while `rolling`. @default 1800000 (30m) */
  idleTtl?: number;
  /** Hard lifetime cap in ms regardless of activity. @default 43200000 (12h) */
  absoluteTtl?: number;
  /**
   * Slide the idle window (re-store + re-cookie) on every request that
   * TOUCHES the session, not just writes — keeps active users signed in
   * (an untouched request never loads the session, so it never slides).
   * Off → only a modified session persists. @default true
   */
  rolling?: boolean;
  /** `SameSite` of the id cookie. @default 'Lax' */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** Set the cookie's `Secure` flag. @default true */
  secure?: boolean;
  /** Cookie path. @default '/' */
  path?: string;
};

/** The per-request session surface — retrieve it with {@link getSession}. */
export type RapidSession = {
  /** The current id, or `undefined` until the first write mints one. */
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

/** Symbol under which the lazy session loader rides the (per-request) ctx. */
const SESSION: unique symbol = Symbol('rapid.session');
type WithSession = { [SESSION]?: () => Promise<RapidSession> };

/**
 * The session for the current request — `await` it — or `undefined` when
 * {@link session} is not installed (or the invoke is not HTTP). The first
 * call verifies the cookie and loads the record (memoized per request);
 * a request that never calls this never touches the store. Stored on the
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
 * Store-backed session middleware. Install it once; read the session in a
 * handler with {@link getSession}. `stock()`-free — the backend is injected,
 * not resolved.
 *
 * @throws {@link RapidError} nothing itself; the injected `store` may reject.
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
  const store = options.store ?? memoryStore<SessionRecord>();
  const name = options.cookie ?? 'sid';
  const idleTtl = options.idleTtl ?? 30 * 60_000;
  const absoluteTtl = options.absoluteTtl ?? 12 * 60 * 60_000;
  const rolling = options.rolling ?? true;
  // Evict a record — real delete when the store has one, else overwrite it with
  // an already-expired stand-in that the next get() prunes.
  const drop = (key: string): void | Promise<void> =>
    store.delete
      ? store.delete(key)
      : store.set(key, { data: {}, createdAt: 0 }, 1);

  return async (ctx, next) => {
    if (ctx.type !== 'HTTP') return await next();

    // The dirty-tracked state, populated by the LAZY load below. Nothing
    // — not the HMAC verify, not the store read — runs until the request
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
      id = await verifySignedValue(ctx.cookies[name], secret);
      if (id !== undefined) {
        const rec = await store.get(id);
        if (rec !== undefined && Date.now() - rec.createdAt < absoluteTtl) {
          // CLONED, never aliased: handing out the in-memory store's own
          // object would let in-place mutations persist even when the
          // save phase never runs — semantics a serializing (redis)
          // store could not match.
          data = structuredClone(rec.data);
          createdAt = rec.createdAt;
        } else {
          id = undefined; // absent / past the absolute cap → start fresh, lazily
        }
      }
      loaded = true;
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
          if (id !== undefined) evict = id; // drop the pre-login record at save
          id = undefined; // new id minted at save
          createdAt = Date.now(); // fresh absolute window post-login
          dirty = true;
        },
        destroy: () => {
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
          // transient store read error) may have verified `id` already —
          // saving then would overwrite the live record with an empty
          // one and re-issue the cookie, erasing the session over a
          // blip. A failed load saves nothing.
          if (loaded && destroyed) {
            // regenerate() then destroy(): the pre-rotation record must
            // die too, or the fixation window survives the logout.
            if (evict !== undefined) await drop(evict);
            if (id !== undefined) await drop(id);
            ctx.deleteCookie(name, { path: options.path ?? '/' });
          } else if (loaded && (dirty || (id !== undefined && rolling))) {
            const fresh = id === undefined;
            id ??= ulid();
            if (evict !== undefined && evict !== id) await drop(evict);
            await store.set(id, { data, createdAt }, idleTtl);
            // Issue on a fresh/rotated id; re-issue to slide the rolling
            // window.
            if (fresh || rolling) {
              ctx.setCookie(name, await signValue(id, ctx.app.secret), {
                httpOnly: true,
                secure: options.secure ?? true,
                sameSite: options.sameSite ?? 'Lax',
                path: options.path ?? '/',
                maxAge: Math.floor(idleTtl / 1000),
              });
            }
          }
        }
      } catch (error) {
        // A store failure in SAVE surfaces as the request's error —
        // unless the handler already threw; the original error wins.
        if (!thrown) throw error;
      }
    }
    if (thrown) throw handlerError;
  };
}
