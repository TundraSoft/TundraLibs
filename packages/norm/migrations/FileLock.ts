/**
 * @module
 *
 * Single-machine mutex: a `migrator.lock` file in the migrations dir
 * (gitignore it). Guards two processes on the SAME box from applying
 * concurrently. Multi-machine races are covered by the SERVER-SIDE
 * advisory lock the Migrator takes automatically on dialects that
 * have one (pg_advisory_lock / GET_LOCK — see executor capabilities);
 * on SQLite the database is a local file, so this file lock is the
 * whole story.
 *
 * The lock file carries the owner's token AND the time it was taken, so
 * a lock left behind by a killed process self-heals: a contender
 * reclaims it once it is older than {@link DEFAULT_STALE_MS}. A LIVE
 * holder keeps its lock fresh by calling {@linkcode FileLock.touch}
 * between migration steps, so a long multi-version apply is never
 * mistaken for a corpse.
 *
 * @since 1.0.0
 */

import {
  deleteFile,
  pathExists,
  readTextFile,
  stat,
  writeTextFile,
} from '@tundralibs/compat/file';
import { NormMigrationError } from '../errors/mod.ts';

const LOCK_FILE = 'migrator.lock';

/**
 * How long a lock file may go untouched before a contender reclaims it.
 * A live holder refreshes the stamp between steps, so this only has to
 * outlast the SLOWEST single step (a table rebuild) — not the whole
 * migration run.
 */
export const DEFAULT_STALE_MS = 15 * 60_000;

/** Settle delay that closes the write/write race window (see acquire). */
const SETTLE_MS = 15;
/** Poll interval while waiting on a live holder. */
const POLL_MS = 100;

/** What a lock file contains. Written as JSON so the age is readable
 * without a stat() and survives a filesystem that lies about mtime. */
type LockPayload = {
  readonly token: string;
  /** Epoch ms of acquisition, refreshed by {@linkcode FileLock.touch}. */
  readonly stampedAt: number;
  /** Best-effort holder label, purely for the timeout message. */
  readonly owner: string;
};

/** Parse a lock file body; `null` when it is not our JSON format (a
 * lock written by an older norm, or a truncated write). */
function parsePayload(text: string): LockPayload | null {
  try {
    const p = JSON.parse(text) as Partial<LockPayload>;
    if (typeof p.token !== 'string' || typeof p.stampedAt !== 'number') {
      return null;
    }
    return {
      token: p.token,
      stampedAt: p.stampedAt,
      owner: typeof p.owner === 'string' ? p.owner : 'unknown',
    };
  } catch {
    return null;
  }
}

/** Best-effort "who am I" for the timeout message. */
function ownerLabel(): string {
  try {
    // deno-lint-ignore no-explicit-any
    const g = globalThis as any;
    const pid = g.Deno?.pid ?? g.process?.pid;
    const host = g.Deno?.hostname?.() ?? g.process?.env?.HOSTNAME;
    return `${host ?? 'host'}/${pid ?? '?'}`;
  } catch {
    return 'unknown';
  }
}

/** Cryptographically random suffix for the lock token (not a security
 * boundary — just avoids the platform PRNG's predictability). */
function randomSuffix(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cross-process advisory lock backed by an exclusive `migrator.lock`
 * file in the migrations directory, so two machines can't run `apply()`
 * concurrently. Complements the engine's server-side advisory lock.
 */
export class FileLock {
  private readonly __path: string;
  private readonly __token: string;
  private readonly __owner: string;
  private readonly __staleMs: number;
  private __held = false;

  /**
   * Bind a lock to a migrations directory's `migrator.lock` file.
   *
   * @param dir - Migrations directory the `migrator.lock` file lives in.
   * @param staleMs - Age at which an untouched lock file is considered
   *   abandoned and may be reclaimed (default
   *   {@linkcode DEFAULT_STALE_MS}). Pass `Infinity` to disable stale
   *   reclaim entirely.
   */
  constructor(dir: string, staleMs: number = DEFAULT_STALE_MS) {
    this.__path = `${dir}/${LOCK_FILE}`;
    this.__token = `${Date.now().toString(36)}-${randomSuffix()}`;
    this.__owner = ownerLabel();
    this.__staleMs = staleMs;
  }

  /** Whether THIS instance currently holds the lock. */
  get held(): boolean {
    return this.__held;
  }

  /**
   * Acquire, polling until `timeoutMs` (default 30s). A lock file that
   * has not been touched for `staleMs` is treated as abandoned and
   * reclaimed rather than waited on.
   *
   * @throws {NormMigrationError} `LOCK_TIMEOUT` when a live holder keeps
   *   the lock for the whole `timeoutMs` window.
   */
  async acquire(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let holder = 'another process';
    while (true) {
      if (!(await pathExists(this.__path))) {
        await this.__write();
        // Read-back closes the write/write race window: whoever's
        // token SURVIVED owns the lock. The short settle delay keeps
        // an interleaved write-write/read-read sequence from letting
        // BOTH contenders read their own token.
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        if (await this.__isOurs()) {
          this.__held = true;
          return;
        }
      } else {
        const owner = await this.__reclaimIfStale();
        // Reclaimed (file deleted) — retry the write immediately.
        if (owner === null) continue;
        holder = owner;
      }
      if (Date.now() >= deadline) {
        throw new NormMigrationError(
          `Could not acquire ${LOCK_FILE} within ${timeoutMs}ms — ` +
            `held by ${holder}. A live migration keeps its lock fresh; ` +
            `an abandoned one is reclaimed automatically after ` +
            `${this.__staleMs}ms.`,
          { subject: this.__path, code: 'LOCK_TIMEOUT' },
        );
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  /**
   * Refresh our stamp so a long-running hold is not mistaken for an
   * abandoned lock. No-op when we do not hold the lock; never throws —
   * a failed refresh only risks an early reclaim, and losing the whole
   * migration over it would be worse.
   */
  async touch(): Promise<void> {
    if (!this.__held) return;
    try {
      if (await this.__isOurs()) await this.__write();
    } catch {
      // Best effort — see above.
    }
  }

  /** Release if held by US; a foreign holder's lock is left alone.
   * Idempotent. */
  async release(): Promise<void> {
    if (!this.__held) return;
    this.__held = false;
    try {
      if (await this.__isOurs()) await deleteFile(this.__path);
    } catch {
      // Already gone.
    }
  }

  /** Write (or re-stamp) the lock file with our token and NOW. */
  private __write(): Promise<void> {
    const payload: LockPayload = {
      token: this.__token,
      stampedAt: Date.now(),
      owner: this.__owner,
    };
    return writeTextFile(this.__path, JSON.stringify(payload));
  }

  /** Does the file on disk still carry OUR token? */
  private async __isOurs(): Promise<boolean> {
    try {
      const text = await readTextFile(this.__path);
      const payload = parsePayload(text);
      // A pre-JSON lock file held the bare token.
      return payload === null ? text === this.__token : payload.token ===
        this.__token;
    } catch {
      return false;
    }
  }

  /**
   * Delete the lock file when its stamp is older than `staleMs`.
   *
   * @returns `null` when the file was reclaimed (caller should retry),
   *   otherwise a label for the live holder.
   */
  private async __reclaimIfStale(): Promise<string | null> {
    if (!Number.isFinite(this.__staleMs)) return 'another process';
    let text: string;
    try {
      text = await readTextFile(this.__path);
    } catch {
      // Vanished between pathExists and read — treat as reclaimed.
      return null;
    }
    const payload = parsePayload(text);
    // Unparseable (pre-JSON or truncated) — fall back to the file's own
    // mtime so a legacy leaked lock still self-heals.
    const stampedAt = payload?.stampedAt ?? await this.__mtimeMs();
    const owner = payload?.owner ?? 'another process';
    if (stampedAt === null || Date.now() - stampedAt < this.__staleMs) {
      return owner;
    }
    try {
      await deleteFile(this.__path);
    } catch {
      // Someone else reclaimed it first — either way it is gone.
    }
    return null;
  }

  /** Lock file mtime in epoch ms, or `null` when unavailable. */
  private async __mtimeMs(): Promise<number | null> {
    try {
      const info = await stat(this.__path);
      return info.mtime === null ? null : info.mtime.getTime();
    } catch {
      return null;
    }
  }
}
