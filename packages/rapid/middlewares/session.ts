/**
 * @fileoverview `session()` — cookie-keyed, store-backed per-client session
 * state. Reads a SIGNED session-id cookie, loads the record from an injected
 * {@link Store}, exposes a dirty-tracked {@link RapidSession} on the request
 * (read it with {@link getSession}), and writes back only when something
 * changed. HTTP-only (a no-op on SOCKET/JOB). The id is signed with
 * `@tundralibs/crypt` HMAC, so a tampered cookie is rejected. Two expiries: a
 * rolling idle TTL (refreshed each request) and a hard absolute cap.
 *
 * @module
 */
import { signHMAC, verifyHMAC } from '@tundralibs/crypt';
import { ulid } from '@tundralibs/id';
import type { Context } from '../context/mod.ts';
import type { RapidContextState, RapidMiddleware } from '../types/mod.ts';
import { memoryStore, type Store } from './store.ts';

/** Arbitrary per-client data held in a session. */
export type SessionData = Record<string, unknown>;

/** The stored envelope — data plus the birth time for the absolute cap. */
type SessionRecord = { data: SessionData; createdAt: number };

/** Options for {@link session}. */
export type SessionOptions = {
  /** HMAC key that signs the session-id cookie (via `@tundralibs/crypt`). */
  secret: string;
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
   * Slide the idle window (re-store + re-cookie) on every request, not just
   * writes — keeps active users signed in. Off → only a modified session
   * persists. @default true
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

/** Symbol under which the live session rides the (per-request) ctx instance. */
const SESSION: unique symbol = Symbol('rapid.session');
type WithSession = { [SESSION]?: RapidSession };

/**
 * The session for the current request, or `undefined` when {@link session} is
 * not installed (or the invoke is not HTTP). Stored on the per-request context
 * instance — never `ctx.state` (which is shared under `stateMode: 'SHARE'`).
 */
export function getSession<S extends RapidContextState = RapidContextState>(
  ctx: Context<S>,
): RapidSession | undefined {
  return (ctx as unknown as WithSession)[SESSION];
}

const signId = (id: string, secret: string): Promise<string> =>
  signHMAC(id, secret).then((mac) => `${id}.${mac}`);

const verifySignedId = async (
  raw: string | undefined,
  secret: string,
): Promise<string | undefined> => {
  if (!raw) return undefined;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return undefined;
  try {
    return (await verifyHMAC(raw.slice(0, dot), raw.slice(dot + 1), secret))
      ? raw.slice(0, dot)
      : undefined;
  } catch {
    return undefined; // a malformed signature is no session, never a 500
  }
};

/**
 * Store-backed session middleware. Install it once; read the session in a
 * handler with {@link getSession}. `stock()`-free — the backend is injected,
 * not resolved.
 *
 * @throws {@link RapidError} nothing itself; the injected `store` may reject.
 *
 * @example
 * ```ts ignore
 * app.use(session({ secret: env.SESSION_SECRET }));
 * app.post('/login', async (ctx) => {
 *   const s = getSession(ctx)!;
 *   s.regenerate();               // new id, keep any anonymous data
 *   s.set('userId', await authenticate(ctx));
 *   return { content: { ok: true } };
 * });
 * ```
 */
export function session(options: SessionOptions): RapidMiddleware {
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

    // 1. LOAD — verify the signed id, fetch + validate the record.
    let id = await verifySignedId(ctx.cookies[name], options.secret);
    let data: SessionData = {};
    let createdAt = Date.now();
    if (id !== undefined) {
      const rec = await store.get(id);
      if (rec !== undefined && Date.now() - rec.createdAt < absoluteTtl) {
        ({ data, createdAt } = rec);
      } else {
        id = undefined; // absent / past the absolute cap → start fresh, lazily
      }
    }

    // 2. EXPOSE — a dirty-tracked wrapper on the per-request ctx instance.
    let dirty = false;
    let destroyed = false;
    let evict: string | undefined; // an old id to drop after regenerate()
    const sess: RapidSession = {
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
    (ctx as unknown as WithSession)[SESSION] = sess;

    // 3. RUN.
    await next();

    // 4. SAVE — only touch store/cookie when something changed.
    if (destroyed) {
      if (id !== undefined) await drop(id);
      ctx.deleteCookie(name, { path: options.path ?? '/' });
      return;
    }
    if (dirty || (id !== undefined && rolling)) {
      const fresh = id === undefined;
      id ??= ulid();
      if (evict !== undefined && evict !== id) await drop(evict);
      await store.set(id, { data, createdAt }, idleTtl);
      // Issue on a fresh/rotated id; re-issue to slide the rolling window.
      if (fresh || rolling) {
        ctx.setCookie(name, await signId(id, options.secret), {
          httpOnly: true,
          secure: options.secure ?? true,
          sameSite: options.sameSite ?? 'Lax',
          path: options.path ?? '/',
          maxAge: Math.floor(idleTtl / 1000),
        });
      }
    }
  };
}
