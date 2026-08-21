/**
 * @module
 *
 * `Migrator` — snapshot-based schema migrations over the executor
 * seam. State-based, no hand-written SQL: every version is a full
 * PHYSICAL snapshot (`0001.json`, `0002.json`, …); the diff between
 * consecutive snapshots is the migration, and "down" is the reverse
 * diff.
 *
 * ```ts ignore
 * const mig = new Migrator(db, { dir: './migrations' });
 * await mig.snapshot();          // 0001.json (no-op if unchanged)
 * await mig.plan();              // inspect the DDL first
 * await mig.apply();             // execute + record in _norm_migrations
 * ```
 *
 * Operational concern by design — imported from
 * `@tundralibs/norm/migrations`, never re-exported from the package
 * root, out of the request path and app bundles.
 *
 * @since 1.0.0
 */

import {
  ensureDir,
  pathExists,
  readDir,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';
import type { Query } from '@tundralibs/oql/types';
import { runtimeOf } from '../Norm.ts';
import type { Runtime } from '../compile.ts';
import { NormAdvisoryLockError, NormMigrationError } from '../errors/mod.ts';
import { hashSourceOf } from '../definition/mod.ts';
import { coerceCount } from '../result.ts';
import { buildSnapshot, fnv1a64, type MigrationSnapshot } from './snapshot.ts';
import { diffSnapshots } from './diff.ts';
import {
  isRebuild,
  type MigrationAction,
  rebuildDdlPlan,
  type RebuildTable,
} from './rebuild.ts';
import {
  canonicalizePlain,
  decodePlain,
  SIBLING_HASH_ALGORITHM,
} from '../crypto.ts';
import { formatVersionFilename, parseVersion } from './version.ts';
import {
  planFilename,
  renderPlan,
  SQL_DIALECTS,
  type SqlDialect,
  storedPlanHash,
} from './plans.ts';
import { DEFAULT_STALE_MS, FileLock } from './FileLock.ts';
import {
  HISTORY_TABLE_NAME,
  historyCreateQuery,
  type HistoryRow,
} from './history.ts';
import { PROGRESS_TABLE_NAME, progressCreateQuery } from './progress.ts';

type Row = Record<string, unknown>;

/** One lock name serializes every migrator against one database. */
const ADVISORY_LOCK_KEY = 'norm:migrator';

/** Rows per page/INSERT during a crypto-transforming rebuild copy. */
const REBUILD_CHUNK = 500;

/** Options for {@link Migrator}. */
export type MigratorOptions = {
  /** Migrations directory (versioned snapshots + migrator.lock). */
  dir: string;
  /** Rows per page/INSERT during crypto-transforming rebuild copies
   * (default 500). Lower = less memory per batch; NOTE each encrypted
   * cell costs a full PBKDF2 derivation either way. A non-positive
   * (finite) value is floored to 1 — a 0-row page would never advance
   * the copy loop; a non-finite value (`NaN`/`Infinity`) falls back to
   * the default 500. */
  rebuildChunkSize?: number;
  /** Write reviewable `000N.<dialect>.sql` plan artifacts alongside each
   * JSON snapshot (default `false` — JSON only). When enabled, `apply()`
   * additionally hash-verifies the stored plan before executing it (the
   * review gate). Generate the SQL from the JSON on demand at any time
   * with {@linkcode Migrator.renderPlans}. */
  renderSql?: boolean;
  /** Age at which an untouched `migrator.lock` is treated as abandoned
   * and reclaimed (default 15 min). A live apply re-stamps the file
   * between versions AND at mid-step checkpoints (per action / per
   * rebuild chunk), so this only has to outlast the slowest single
   * uninterruptible operation. `Infinity` disables stale reclaim. */
  lockStaleMs?: number;
  /** Per-version transaction timeout, in ms, on transactional-DDL
   * engines (Postgres/SQLite). `0` (the default — omitted or passed
   * explicitly, as is any non-positive value) DISARMS the driver's
   * auto-rollback timer so a long rebuild is not capped at the engine's
   * request-scale `transactionTimeout` (120s) — a large chunked crypto
   * REBUILD legitimately runs for many minutes and must not be
   * force-rolled-back mid-copy. Set a POSITIVE value to re-impose a
   * ceiling; it is rounded up to whole seconds and never lands below
   * 1s. */
  transactionTimeoutMs?: number;
};

/** Outcome of a {@link Migrator.snapshot} call. */
export type SnapshotResult = {
  version: number;
  path: string;
  /** false = schema identical to the head snapshot; nothing written. */
  written: boolean;
};

/** Applied-versus-disk migration state. */
export type MigratorStatus = {
  /** Highest applied version (0 = fresh database). */
  dbVersion: number;
  /** Highest snapshot on disk (0 = none yet). */
  fsVersion: number;
  /** On disk but not applied, ascending. */
  pending: ReadonlyArray<number>;
  /** Applied head snapshot still matches its recorded hash. */
  hashOk: boolean;
};

/** One version's planned DDL, suppressed drops, and warnings. */
export type PlannedStep = {
  version: number;
  queries: ReadonlyArray<MigrationAction>;
  /** Drops suppressed by allowDrop:false — surfaced, never silent. */
  blockedDrops: ReadonlyArray<string>;
  /** Apply-time hazards (NOT NULL adds on possibly-populated tables). */
  warnings: ReadonlyArray<string>;
};

/** Options for {@link Migrator.apply}. */
export type ApplyOptions = {
  /** Emit DROP TABLE/COLUMN (default false — data-loss guard). */
  allowDrop?: boolean;
  /** Audit column; defaults to USER/USERNAME env. */
  appliedBy?: string;
  /** File-lock acquire timeout (default 30s). */
  lockTimeoutMs?: number;
  /** Compute + return the plan without executing anything. */
  dryRun?: boolean;
};

/** Outcome of a {@link Migrator.apply} call. */
export type ApplyResult = {
  applied: ReadonlyArray<number>;
  durationMs: number;
  /** Present only for dryRun. */
  plannedQueries?: ReadonlyArray<PlannedStep>;
};

/**
 * Snapshot-based schema migrator over the executor seam. Bind it to a
 * `norm.use(...)` handle and a migrations directory; each version is a
 * full JSON snapshot on disk, the diff between consecutive snapshots is
 * the migration, and "down" is the reverse diff.
 *
 * Operational by design — import from `@tundralibs/norm/migrations`,
 * keep it out of the request path.
 *
 * @example
 * ```ts ignore
 * const mig = new Migrator(db, { dir: './migrations' });
 * await mig.snapshot();    // 0001.json (JSON only — SQL is opt-in)
 * await mig.renderPlans(); // optional: 0001.<dialect>.sql from the JSON
 * await mig.plan();        // inspect the DDL first
 * await mig.apply();       // execute + record in _norm_migrations
 * ```
 */
export class Migrator {
  private readonly __runtime: Runtime;
  private readonly __dir: string;
  private readonly __chunk: number;
  private readonly __renderSql: boolean;
  private readonly __lockStaleMs: number;
  /** Per-version transaction timeout in SECONDS (0 = disarmed). */
  private readonly __txTimeoutSec: number;
  /** The FileLock held by the in-flight apply()/rollback(), so long
   * single steps can re-stamp it mid-run (see __touchLock). */
  private __activeLock: FileLock | undefined;
  private __historyEnsured = false;
  private __progressEnsured = false;
  /** Parsed snapshots by version — files are write-once per version, so
   * one apply()'s status/plan/verify passes read each at most once. */
  private readonly __snapshotCache = new Map<number, MigrationSnapshot>();
  /** Memoized `readDir` version scan; invalidated whenever `snapshot()`
   * writes a new version file. */
  private __versionsCache: number[] | undefined;

  /**
   * Bind a migrator to a `norm.use(...)` handle and migrations directory.
   *
   * @param db The handle returned by `norm.use(...)`.
   */
  constructor(db: object, options: MigratorOptions) {
    this.__runtime = runtimeOf(db);
    // Trailing slashes are trimmed by scanning back from the end rather than
    // with `/\/+$/`: that pattern re-tries from every position and re-scans the
    // run each time, so a path of many slashes costs O(n^2). This is O(n) with
    // a single allocation.
    let dirEnd = options.dir.length;
    while (dirEnd > 0 && options.dir[dirEnd - 1] === '/') dirEnd--;
    this.__dir = options.dir.slice(0, dirEnd);
    // A non-positive chunk is nonsense for the rebuild pager: `limit: 0`
    // means UNBOUNDED downstream and `offset += 0` never advances, so the
    // copy loop would re-read the same page forever. Floor at one row.
    const chunk = options.rebuildChunkSize;
    this.__chunk = chunk === undefined || !Number.isFinite(chunk)
      ? REBUILD_CHUNK
      : Math.max(1, Math.floor(chunk));
    this.__renderSql = options.renderSql ?? false;
    this.__lockStaleMs = options.lockStaleMs ?? DEFAULT_STALE_MS;
    // 0 (the default, and any non-positive value) DISARMS the driver's
    // request-scale auto-rollback timer; a positive ms value re-imposes a
    // ceiling (rounded up to whole seconds, the driver's unit; never
    // below 1s when opted in). The `<= 0` test is load-bearing: matching
    // only `undefined` made the DOCUMENTED explicit `transactionTimeoutMs:
    // 0` fall into the clamp and arm a 1-SECOND cap — the polar opposite
    // of "disarmed", killing every version whose DDL ran past a second.
    const txMs = options.transactionTimeoutMs;
    this.__txTimeoutSec = txMs === undefined || !(txMs > 0)
      ? 0
      : Math.max(1, Math.ceil(txMs / 1000));
  }

  /** Re-stamp the in-flight apply/rollback's file lock so a long single
   * step (a chunked rebuild copy, a per-action checkpoint loop) is not
   * mistaken for an abandoned lock and reclaimed by a contender — which,
   * on engines with no server-side advisory lock (Mongo, SQLite), is the
   * ONLY thing keeping two runners off the same version. No-op / never
   * throws when no apply is in flight (touch() guards `__held`). */
  private __touchLock(): Promise<void> {
    return this.__activeLock?.touch() ?? Promise.resolve();
  }

  // ─── Snapshot ──────────────────────────────────────────────────────

  /** Write the next versioned snapshot — unless the schema is
   * hash-identical to the current head. */
  async snapshot(): Promise<SnapshotResult> {
    await ensureDir(this.__dir);
    const current = buildSnapshot(
      this.__runtime.registry,
      new Date().toISOString(),
    );
    const versions = await this.__fsVersions();
    const head = versions.at(-1);
    if (head !== undefined) {
      const headSnap = await this.__readSnapshot(head);
      if (headSnap.hash === current.hash) {
        return {
          version: head,
          path: `${this.__dir}/${formatVersionFilename(head)}`,
          written: false,
        };
      }
    }
    const version = (head ?? 0) + 1;
    const path = `${this.__dir}/${formatVersionFilename(version)}`;
    await writeTextFile(path, JSON.stringify(current, null, 2));
    this.__versionsCache = undefined; // a new version file now exists
    // Reviewable `.sql` plan artifacts are opt-in (`renderSql`) — the JSON
    // snapshot is always the source of truth. When enabled they ride along
    // here and apply() hash-verifies them; otherwise generate them on demand
    // with renderPlans(), and apply() runs the freshly-computed plan.
    if (this.__renderSql) {
      const prev = head !== undefined ? await this.__readSnapshot(head) : null;
      await this.__writePlanArtifacts(version, prev, current);
    }
    return { version, path, written: true };
  }

  /** (Re)render the `000N.<dialect>.sql` plan artifacts for every
   * snapshot on disk — use after hand-editing definitions or when an
   * artifact went missing. Returns the files written. */
  async renderPlans(): Promise<
    ReadonlyArray<{ version: number; files: ReadonlyArray<string> }>
  > {
    const versions = await this.__fsVersions();
    const out: Array<{ version: number; files: string[] }> = [];
    for (const version of versions) {
      const prevVersion = versions.filter((v) => v < version).at(-1);
      const prev = prevVersion === undefined
        ? null
        : await this.__readSnapshot(prevVersion);
      const curr = await this.__readSnapshot(version);
      const files = await this.__writePlanArtifacts(version, prev, curr);
      out.push({ version, files });
    }
    return out;
  }

  // ─── Status / plan ─────────────────────────────────────────────────

  /** Where the database stands relative to the snapshots on disk:
   * applied head vs. filesystem head, the pending versions between
   * them, and whether the applied head still matches its recorded
   * hash (`hashOk: false` means the definitions drifted after apply). */
  async status(): Promise<MigratorStatus> {
    const versions = await this.__fsVersions();
    const fsVersion = versions.at(-1) ?? 0;
    const dbVersion = await this.__dbHeadVersion();
    const pending = versions.filter((v) => v > dbVersion);
    let hashOk = true;
    if (dbVersion > 0) {
      const row = await this.__historyRow(dbVersion);
      if (row !== undefined) {
        if (!versions.includes(dbVersion)) {
          // Applied snapshot file is GONE — nothing to verify against.
          hashOk = false;
        } else {
          const snap = await this.__readSnapshot(dbVersion);
          hashOk = snap.hash === row.hash;
        }
      }
    }
    return { dbVersion, fsVersion, pending, hashOk };
  }

  /** The DDL each pending version would run, oldest first. Throws
   * loudly when a step needs an ALTER this dialect cannot do. */
  async plan(opts: { allowDrop?: boolean } = {}): Promise<PlannedStep[]> {
    const versions = await this.__fsVersions();
    const dbVersion = await this.__dbHeadVersion();
    if (dbVersion > 0 && !versions.includes(dbVersion)) {
      throw new NormMigrationError(
        `Applied snapshot ${dbVersion} is missing from ${this.__dir} — ` +
          `pending diffs would baseline against the wrong version. ` +
          `Restore the file.`,
        { dir: this.__dir, version: dbVersion, code: 'MISSING_SNAPSHOT' },
      );
    }
    const pending = versions.filter((v) => v > dbVersion);
    const steps: PlannedStep[] = [];
    for (const version of pending) {
      const prevVersion = versions.filter((v) => v < version).at(-1);
      const prev = prevVersion === undefined
        ? null
        : await this.__readSnapshot(prevVersion);
      const curr = await this.__readSnapshot(version);
      const caps = this.__runtime.executor.capabilities;
      const diff = diffSnapshots(prev, curr, {
        allowDrop: opts.allowDrop,
        inPlaceAlter: caps.alterColumns && caps.alterConstraints,
      });
      steps.push({
        version,
        queries: diff.actions,
        blockedDrops: diff.blockedDrops,
        warnings: diff.warnings,
      });
    }
    return steps;
  }

  // ─── Apply / rollback ──────────────────────────────────────────────

  /**
   * Run every pending migration under a server-side advisory lock,
   * recording each in `_norm_migrations`. Refuses to run on detected
   * drift or a plan-hash mismatch, and suppresses drops unless
   * `allowDrop` is set — data loss is never silent.
   *
   * A version's plan is atomic where the engine allows it: on Postgres
   * and SQLite the DDL **and** its `_norm_migrations` row run inside one
   * transaction, so a mid-plan failure leaves the schema untouched. On
   * MariaDB (DDL implicitly COMMITs) and Mongo it cannot be, so the
   * RETRY is made safe instead — progress is checkpointed per action in
   * `_norm_migration_progress` and a later apply resumes from there.
   * `docs/NORM-Migrations.md` states the guarantee per dialect.
   *
   * @param opts - `dryRun` returns the plan without executing;
   *   `allowDrop` permits DROP TABLE/COLUMN; `appliedBy` sets the audit
   *   column; `lockTimeoutMs` bounds the lock wait (default 30s).
   * @returns The applied versions and elapsed time (plus the planned
   *   queries when `dryRun`).
   * @throws {NormMigrationError} `DRIFT` when the applied head no longer
   *   matches its recorded hash, `BLOCKED_DROPS` when drops are
   *   suppressed, `LOCK_TIMEOUT` when either lock cannot be taken, or
   *   `PLAN_CHANGED` when a checkpointed version's plan has moved.
   */
  async apply(opts: ApplyOptions = {}): Promise<ApplyResult> {
    const started = Date.now();
    if (opts.dryRun === true) {
      const status = await this.status();
      if (!status.hashOk) this.__throwDrift(status.dbVersion);
      return {
        applied: [],
        durationMs: Date.now() - started,
        plannedQueries: await this.plan({ allowDrop: opts.allowDrop }),
      };
    }

    // Status + plan are computed INSIDE the lock: a plan computed
    // before waiting on a concurrent apply would be stale by the time
    // it runs.
    const lock = new FileLock(this.__dir, this.__lockStaleMs);
    await lock.acquire(opts.lockTimeoutMs);
    this.__activeLock = lock;
    const applied: number[] = [];
    try {
      // The advisory lock wraps the critical section INSIDE the try: it
      // throws LOCK_TIMEOUT when another host is mid-deploy, and a throw
      // outside would strand migrator.lock on this host forever. The
      // executor pins acquire+release to one connection and releases on
      // every exit path (see __withAdvisoryLock).
      await this.__withAdvisoryLock(opts.lockTimeoutMs ?? 30_000, async () => {
        const status = await this.status();
        if (!status.hashOk) this.__throwDrift(status.dbVersion);
        const steps = await this.plan({ allowDrop: opts.allowDrop });
        const blocked = steps.flatMap((s) =>
          s.blockedDrops.map((b) => `v${s.version}: ${b}`)
        );
        if (blocked.length > 0) {
          // Recording a version while silently skipping its drops would
          // permanently desync the database from the snapshot chain.
          throw new NormMigrationError(
            `apply refused: drops are blocked (allowDrop: false) — ` +
              `${blocked.join('; ')}. Pass allowDrop: true, or add ` +
              `renamedFrom hints if these are renames.`,
            { dir: this.__dir, code: 'BLOCKED_DROPS' },
          );
        }
        // steps.length === 0 → the loop is a no-op and `applied` stays
        // empty, yielding the same result as the old empty-plan return.
        for (const step of steps) {
          await this.__verifyPlanArtifact(step.version, step.queries);
          await this.__applyStep(step, opts.appliedBy);
          applied.push(step.version);
          // Keep the file lock fresh so a long multi-version apply is
          // never mistaken for an abandoned one.
          await lock.touch();
        }
      });
    } finally {
      this.__activeLock = undefined;
      await lock.release();
    }
    return { applied, durationMs: Date.now() - started };
  }

  /**
   * Execute ONE planned version and record it.
   *
   * Transactional-DDL engines (Postgres, SQLite) run the whole plan plus
   * its history row in a single transaction — a failure anywhere rolls
   * the version back completely. Everything else checkpoints per action
   * so the retry resumes instead of re-emitting.
   */
  private async __applyStep(
    step: PlannedStep,
    appliedBy: string | undefined,
  ): Promise<void> {
    const ex = this.__runtime.executor;
    const stepStart = Date.now();
    const snap = await this.__readSnapshot(step.version);
    const record = (txId?: string): Promise<void> =>
      this.__insertHistory({
        version: step.version,
        hash: snap.hash,
        appliedAt: new Date().toISOString(),
        appliedBy: appliedBy ?? envUser(),
        durationMs: Date.now() - stepStart,
      }, txId);
    // The history table must exist BEFORE the transaction opens — its
    // CREATE is DDL of its own and would join (and on SQLite, be rolled
    // back with) the version's transaction.
    await this.__ensureHistory();

    if (ex.capabilities.transactionalDdl) {
      // CREATE_SCHEMA is deliberately left outside: SQLite emulates
      // schemas with ATTACH DATABASE, which the driver refuses inside a
      // caller-supplied transaction. It is idempotent on Postgres
      // (IF NOT EXISTS) and connection-scoped on SQLite, so re-running
      // it on a retry is safe.
      const inTx: MigrationAction[] = [];
      for (const q of step.queries) {
        if (!isRebuild(q) && q.type === 'CREATE_SCHEMA') await ex.ddl(q);
        else inTx.push(q);
      }
      await ex.transaction(async (session) => {
        for (const q of inTx) {
          if (isRebuild(q)) await this.__rebuild(q, session.id);
          else await ex.ddl(q, session.id);
        }
        await record(session.id);
      }, { timeout: this.__txTimeoutSec });
      return;
    }

    // Non-transactional DDL (MariaDB implicitly COMMITs each statement;
    // Mongo has no transactions). Atomicity is impossible, so make the
    // RETRY safe: checkpoint after every action and resume from there.
    const planHash = actionsHash(step.queries);
    let done = await this.__readProgress(step.version, planHash);
    for (let i = done; i < step.queries.length; i++) {
      const q = step.queries[i]!;
      if (isRebuild(q)) await this.__rebuild(q);
      else await ex.ddl(q);
      await this.__writeProgress(step.version, planHash, i + 1, done > 0);
      // Re-stamp the file lock per action: on advisory-lock-less engines
      // (Mongo) it is the sole guard, and a version whose actions exceed
      // the stale TTL would otherwise look abandoned mid-run.
      await this.__touchLock();
      done = i + 1;
    }
    await record();
    await this.__clearProgress(step.version);
  }

  /**
   * Revert to `to` (default: one version back). Drops are implied —
   * rolling back a CREATE is a DROP. Each reverted version runs under
   * the same per-dialect atomicity rules as {@linkcode Migrator.apply}.
   *
   * @throws {NormMigrationError} `INVALID_ROLLBACK` when `to` is not
   *   below the applied head, `MISSING_SNAPSHOT` when a snapshot file
   *   needed for the reverse diff is gone, or `LOCK_TIMEOUT` when
   *   either lock cannot be taken.
   */
  async rollback(
    opts: { to?: number; lockTimeoutMs?: number } = {},
  ): Promise<{ reverted: ReadonlyArray<number>; durationMs: number }> {
    const started = Date.now();
    const dbVersion = await this.__dbHeadVersion();
    if (dbVersion === 0) return { reverted: [], durationMs: 0 };
    const target = opts.to ?? dbVersion - 1;
    if (target < 0 || target >= dbVersion) {
      throw new NormMigrationError(
        `rollback target ${target} is not below the applied head ` +
          `${dbVersion}.`,
        { dir: this.__dir, version: target, code: 'INVALID_ROLLBACK' },
      );
    }
    const versions = await this.__fsVersions();
    const lock = new FileLock(this.__dir, this.__lockStaleMs);
    await lock.acquire(opts.lockTimeoutMs);
    this.__activeLock = lock;
    const reverted: number[] = [];
    try {
      // Same reasoning as apply(): a LOCK_TIMEOUT from the advisory lock
      // must not strand migrator.lock on this host.
      await this.__withAdvisoryLock(opts.lockTimeoutMs ?? 30_000, async () => {
        for (let v = dbVersion; v > target; v--) {
          if (!versions.includes(v)) {
            throw new NormMigrationError(
              `Cannot roll back version ${v}: its snapshot file is missing.`,
              { dir: this.__dir, version: v, code: 'MISSING_SNAPSHOT' },
            );
          }
          const from = await this.__readSnapshot(v);
          const prevVersion = versions.filter((x) => x < v).at(-1);
          const to = prevVersion === undefined
            ? { format: 1 as const, generatedAt: '', hash: '', entities: {} }
            : await this.__readSnapshot(prevVersion);
          // Reverse diff; drops are the point of a rollback.
          const caps = this.__runtime.executor.capabilities;
          const diff = diffSnapshots(from, to, {
            allowDrop: true,
            inPlaceAlter: caps.alterColumns && caps.alterConstraints,
          });
          await this.__revertStep(v, diff.actions);
          reverted.push(v);
          await lock.touch();
        }
      });
    } finally {
      this.__activeLock = undefined;
      await lock.release();
    }
    return { reverted, durationMs: Date.now() - started };
  }

  /** Execute ONE reverse diff and un-record the version, under the same
   * per-dialect atomicity rules as {@linkcode Migrator.apply}. */
  private async __revertStep(
    version: number,
    actions: ReadonlyArray<MigrationAction>,
  ): Promise<void> {
    const ex = this.__runtime.executor;
    await this.__ensureHistory();
    if (ex.capabilities.transactionalDdl) {
      await ex.transaction(async (session) => {
        for (const q of actions) {
          if (isRebuild(q)) await this.__rebuild(q, session.id);
          else await ex.ddl(q, session.id);
        }
        await this.__deleteHistory(version, session.id);
      }, { timeout: this.__txTimeoutSec });
      // A rolled-back version can have no checkpoint left to honour.
      await this.__clearProgress(version);
      return;
    }
    const planHash = actionsHash(actions);
    let done = await this.__readProgress(version, planHash);
    for (let i = done; i < actions.length; i++) {
      const q = actions[i]!;
      if (isRebuild(q)) await this.__rebuild(q);
      else await ex.ddl(q);
      await this.__writeProgress(version, planHash, i + 1, done > 0);
      await this.__touchLock();
      done = i + 1;
    }
    await this.__deleteHistory(version);
    await this.__clearProgress(version);
  }

  /** Applied migrations, newest first. */
  async history(): Promise<HistoryRow[]> {
    await this.__ensureHistory();
    const res = await this.__runtime.executor.execute<Row>(
      {
        type: 'SELECT',
        table: HISTORY_TABLE_NAME,
        columns: ['version', 'hash', 'appliedAt', 'appliedBy', 'durationMs'],
        projection: {
          '@version': true,
          '@hash': true,
          '@appliedAt': true,
          '@appliedBy': true,
          '@durationMs': true,
        },
        orderBy: { '@version': 'DESC' },
      },
    );
    return (res.data as Row[]).map((r) => ({
      version: coerceCount(r.version),
      hash: String(r.hash),
      appliedAt: String(r.appliedAt),
      appliedBy: r.appliedBy === null || r.appliedBy === undefined
        ? null
        : String(r.appliedBy),
      durationMs: r.durationMs === null || r.durationMs === undefined
        ? null
        : coerceCount(r.durationMs),
    }));
  }

  // ─── Internals ─────────────────────────────────────────────────────

  /** Run `fn` under the server-side advisory lock when the dialect has
   * one — the file lock only serializes THIS host; CI/CD runs apply
   * from N replicas. Where the engine has no advisory lock, `fn` runs
   * directly (the file lock alone guards it).
   *
   * The executor pins the lock's ACQUIRE and RELEASE to one physical
   * connection so the release always reaches the backend that took the
   * lock — a pooled unlock can otherwise land on a different backend
   * and leak the lock permanently. `fn`'s own errors propagate
   * unchanged; only an ACQUIRE failure is remapped to `LOCK_TIMEOUT`. */
  private __withAdvisoryLock<T>(
    timeoutMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const ex = this.__runtime.executor;
    if (!ex.capabilities.advisoryLock) return fn();
    return ex.withAdvisoryLock(ADVISORY_LOCK_KEY, timeoutMs, fn).catch(
      (cause: unknown) => {
        // Only a failure to TAKE the lock becomes LOCK_TIMEOUT; an error
        // thrown by `fn` (a real migration failure) must surface as-is.
        if (cause instanceof NormAdvisoryLockError) {
          throw new NormMigrationError(
            `Another process holds the migration advisory lock ` +
              `('${ADVISORY_LOCK_KEY}') — is a deploy running elsewhere?`,
            { dir: this.__dir, code: 'LOCK_TIMEOUT' },
            cause,
          );
        }
        throw cause;
      },
    );
  }

  /** Execute a REBUILD_TABLE: drop old indexes → rename aside →
   * create new shape (+ indexes) → copy rows → verify counts → drop
   * the aside table. Crypto flips stream rows through JS
   * (decrypt / re-encrypt / digest-backfill); structural rebuilds
   * copy with one INSERT…SELECT. NOT crash-safe on MariaDB (DDL
   * implicitly commits) — a failed run leaves `__pre_migrate` behind
   * and the next apply fails the rename loudly; the per-action
   * checkpoint cannot help mid-rebuild, so that case stays manual.
   * @param txId - Transaction to run inside, on engines with
   *   transactional DDL (the whole rebuild then rolls back as one). */
  private async __rebuild(r: RebuildTable, txId?: string): Promise<void> {
    const ex = this.__runtime.executor;
    // ONE shared plan builder feeds this loop AND the stored plan
    // artifacts — see rebuildDdlPlan.
    const plan = rebuildDdlPlan(r);
    const aside = plan.aside;
    for (const q of plan.preCopy) await ex.ddl(q, txId);

    if (plan.structuralCopy !== null) {
      await ex.execute(plan.structuralCopy, txId);
    } else {
      await this.__copyTransformed(r, aside, txId);
    }

    // 4. Verify BEFORE dropping the source of truth.
    const count = async (
      table: string,
      dbSchema: string | undefined,
      cols: string[],
    ): Promise<number> => {
      const res = await ex.execute<Record<string, unknown>>(
        {
          type: 'COUNT',
          table,
          ...(dbSchema !== undefined ? { schema: dbSchema } : {}),
          columns: cols,
        },
        txId,
      );
      return coerceCount(
        (res.data[0] as Record<string, unknown> | undefined)?.Count ??
          res.count,
      );
    };
    const copied = await count(
      r.to.name,
      r.to.dbSchema,
      Object.keys(r.to.columns),
    );
    const original = await count(
      aside,
      r.from.dbSchema,
      Object.keys(r.from.columns),
    );
    if (copied !== original) {
      throw new NormMigrationError(
        `Rebuild of '${r.entityKey}': copied ${copied} of ${original} ` +
          `rows — the original is preserved as '${aside}'.`,
        { subject: r.entityKey, code: 'REBUILD_COUNT_MISMATCH' },
      );
    }
    for (const q of plan.postCopy) await ex.ddl(q, txId);
  }

  /** Crypto-transforming copy: decrypt what WAS encrypted, encrypt
   * what IS, backfill digest siblings from the recovered plaintext.
   * CHUNKED — pages the aside table by pk order and inserts per
   * batch, so a multi-million-row rebuild never materializes the
   * whole table in memory. */
  private async __copyTransformed(
    r: RebuildTable,
    aside: string,
    txId?: string,
  ): Promise<void> {
    const ex = this.__runtime.executor;
    const crypto = this.__runtime.crypto;
    const secret = crypto.secret;
    if (secret === undefined || secret.length === 0) {
      throw new NormMigrationError(
        `Rebuild of '${r.entityKey}' rewrites encrypted data — a ` +
          `'secret' must be configured on the Norm instance.`,
        { subject: r.entityKey, code: 'MISSING_SECRET' },
      );
    }
    const schema = r.from.dbSchema !== undefined
      ? { schema: r.from.dbSchema }
      : {};
    const projection: Record<string, true> = {};
    for (const [, prev] of r.pairs) projection[`@${prev}`] = true;
    // Stable paging order: LIMIT/OFFSET without ORDER BY is
    // engine-dependent. The aside table is static (locks held), but
    // pk order makes the walk deterministic everywhere.
    const orderBy: Record<string, 'ASC'> = {};
    for (const pkCol of r.from.primaryKeys ?? []) orderBy[`@${pkCol}`] = 'ASC';

    const outCols = new Set<string>(r.pairs.map(([cur]) => cur));
    // Target-side digest siblings to (re)compute from plaintext.
    const siblings: Array<[string, string]> = []; // [siblingCol, sourceCol]
    for (const col of Object.keys(r.to.columns)) {
      const source = hashSourceOf(col);
      if (source === null) continue;
      if (r.to.columns[source]?.hash === true) {
        siblings.push([col, source]);
        outCols.add(col);
      }
    }

    for (let offset = 0;; offset += this.__chunk) {
      const res = await ex.execute<Record<string, unknown>>(
        {
          type: 'SELECT',
          table: aside,
          ...schema,
          columns: r.pairs.map(([, prev]) => prev),
          projection,
          ...(Object.keys(orderBy).length > 0 ? { orderBy } : {}),
          limit: this.__chunk,
          offset,
        },
        txId,
      );
      const batch = res.data as Record<string, unknown>[];
      if (batch.length === 0) break;
      const out: Record<string, unknown>[] = [];
      for (const row of batch) {
        const target: Record<string, unknown> = {};
        const plain = new Map<string, string>(); // canonical plaintext
        for (const [cur, prev] of r.pairs) {
          // Old-side siblings are recomputed, not copied.
          if (
            hashSourceOf(cur) !== null &&
            r.to.columns[hashSourceOf(cur)!]?.hash === true
          ) continue;
          let v = row[prev];
          const was = r.from.columns[prev]!;
          const is = r.to.columns[cur]!;
          if (v !== null && v !== undefined) {
            if (was.encrypt === true && typeof v === 'string') {
              // Canonical plaintext; decode only when it LEAVES crypto.
              const canonical = await crypto.decrypt(
                v,
                secret,
                crypto.algorithm,
              );
              v = is.encrypt === true
                ? await crypto.encrypt(canonical, secret, crypto.algorithm)
                : decodePlain(canonical, is.type);
              plain.set(cur, canonical);
            } else if (was.encrypt !== true && is.encrypt === true) {
              const canonical = coerceCanonical(v, was.type);
              plain.set(cur, canonical);
              v = await crypto.encrypt(canonical, secret, crypto.algorithm);
            } else if (is.hash === true) {
              // Unchanged plaintext column gaining a sibling.
              plain.set(cur, coerceCanonical(v, was.type));
            }
          }
          target[cur] = v ?? null;
        }
        for (const [sibling, source] of siblings) {
          const canonical = plain.get(source);
          target[sibling] = canonical === undefined
            ? null
            : await crypto.hash(canonical, SIBLING_HASH_ALGORITHM);
        }
        out.push(target);
      }

      if (out.length > 0) {
        await ex.execute(
          {
            type: 'INSERT',
            table: r.to.name,
            ...(r.to.dbSchema !== undefined ? { schema: r.to.dbSchema } : {}),
            columns: [...outCols],
            data: out as Query<'INSERT'>['data'],
          },
          txId,
        );
      }
      // Re-stamp the file lock per chunk: a multi-million-row crypto
      // rebuild (a full PBKDF2 per encrypted cell) can run for many
      // minutes — far past the stale TTL — and on engines with no
      // server-side advisory lock the file lock is all that stops a
      // contender from reclaiming and running the same version.
      await this.__touchLock();
      if (batch.length < this.__chunk) break;
    }
  }

  /** Render + write `000N.<dialect>.sql` for every SQL dialect.
   * Always `allowDrop: true` — reviewers must SEE implied drops. */
  private async __writePlanArtifacts(
    version: number,
    prev: MigrationSnapshot | null,
    curr: MigrationSnapshot,
  ): Promise<string[]> {
    const files: string[] = [];
    for (const dialect of SQL_DIALECTS) {
      const diff = diffSnapshots(prev, curr, {
        allowDrop: true,
        inPlaceAlter: dialect !== 'sqlite',
      });
      const rendered = renderPlan(version, dialect, diff.actions);
      const file = `${this.__dir}/${planFilename(version, dialect)}`;
      await writeTextFile(file, rendered.text);
      files.push(file);
    }
    return files;
  }

  /** The review contract: recompute THIS dialect's plan for the
   * version and refuse when its hash no longer matches the stored
   * artifact — production must execute exactly what was reviewed.
   * Mongo has no SQL artifacts; it skips. */
  private async __verifyPlanArtifact(
    version: number,
    actions: PlannedStep['queries'],
  ): Promise<void> {
    const caps = this.__runtime.executor.capabilities;
    if (caps.dialect === 'mongo') return;
    const dialect = caps.dialect as SqlDialect;
    const file = `${this.__dir}/${planFilename(version, dialect)}`;
    let stored: string;
    try {
      stored = await readTextFile(file);
    } catch {
      // SQL plans are opt-in (`renderSql` / `renderPlans()`). With no stored
      // artifact there is nothing to review against, so apply() executes the
      // freshly-computed plan directly — the review gate is active only when
      // the `.sql` artifacts exist.
      return;
    }
    // Render the plan apply() will ACTUALLY execute (already diffed in
    // plan() as `actions`) instead of re-reading snapshots and
    // re-diffing — same inPlaceAlter, so the same hash.
    const storedHash = storedPlanHash(stored);
    const rendered = renderPlan(version, dialect, actions);
    if (storedHash !== rendered.hash) {
      throw new NormMigrationError(
        `Plan artifact ${planFilename(version, dialect)} does not match ` +
          `the plan this apply would execute (stored ${storedHash}, ` +
          `computed ${rendered.hash}) — the snapshot or artifact changed ` +
          `after review. Re-run renderPlans(), get the diff re-reviewed, ` +
          `then apply.`,
        { dir: this.__dir, version, code: 'PLAN_HASH_MISMATCH' },
      );
    }
  }

  private __throwDrift(version: number): never {
    throw new NormMigrationError(
      `Applied snapshot ${version} no longer matches its recorded ` +
        `hash — was the file edited (or deleted) after application?`,
      { dir: this.__dir, version, code: 'DRIFT' },
    );
  }

  /** Versioned snapshot files on disk (sorted). Memoized for the run —
   * only `snapshot()` adds files, and it clears the memo when it does —
   * so status/plan share ONE readDir scan per apply(). */
  private async __fsVersions(): Promise<number[]> {
    if (this.__versionsCache !== undefined) return this.__versionsCache;
    if (!(await pathExists(this.__dir))) return (this.__versionsCache = []);
    const versions: number[] = [];
    for await (const entry of readDir(this.__dir)) {
      const v = parseVersion(entry.name);
      if (v !== null) versions.push(v);
    }
    return (this.__versionsCache = versions.sort((a, b) => a - b));
  }

  private async __readSnapshot(version: number): Promise<MigrationSnapshot> {
    const cached = this.__snapshotCache.get(version);
    if (cached !== undefined) return cached;
    const path = `${this.__dir}/${formatVersionFilename(version)}`;
    try {
      const snap = JSON.parse(await readTextFile(path)) as MigrationSnapshot;
      this.__snapshotCache.set(version, snap);
      return snap;
    } catch (cause) {
      throw new NormMigrationError(
        `Cannot read snapshot ${path}.`,
        { dir: this.__dir, version, code: 'MISSING_SNAPSHOT' },
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    }
  }

  private async __ensureHistory(): Promise<void> {
    if (this.__historyEnsured) return;
    await this.__runtime.executor.ddl(historyCreateQuery());
    this.__historyEnsured = true;
  }

  private async __dbHeadVersion(): Promise<number> {
    await this.__ensureHistory();
    const res = await this.__runtime.executor.execute<Row>(
      {
        type: 'SELECT',
        table: HISTORY_TABLE_NAME,
        columns: ['version'],
        projection: { '@version': true },
        orderBy: { '@version': 'DESC' },
        limit: 1,
      },
    );
    const row = (res.data as Row[])[0];
    return row === undefined ? 0 : coerceCount(row.version);
  }

  /** The recorded hash for an applied version — the ONLY field
   * status()'s drift check reads. */
  private async __historyRow(
    version: number,
  ): Promise<{ version: number; hash: string } | undefined> {
    await this.__ensureHistory();
    const res = await this.__runtime.executor.execute<Row>(
      {
        type: 'SELECT',
        table: HISTORY_TABLE_NAME,
        columns: ['version', 'hash'],
        projection: { '@version': true, '@hash': true },
        where: { '@version': version },
      },
    );
    const r = (res.data as Row[])[0];
    if (r === undefined) return undefined;
    return { version, hash: String(r.hash) };
  }

  private async __insertHistory(row: HistoryRow, txId?: string): Promise<void> {
    await this.__ensureHistory();
    await this.__runtime.executor.execute(
      {
        type: 'INSERT',
        table: HISTORY_TABLE_NAME,
        columns: ['version', 'hash', 'appliedAt', 'appliedBy', 'durationMs'],
        data: {
          version: row.version,
          hash: row.hash,
          appliedAt: row.appliedAt,
          appliedBy: row.appliedBy,
          durationMs: row.durationMs,
        },
      },
      txId,
    );
  }

  private async __deleteHistory(version: number, txId?: string): Promise<void> {
    await this.__runtime.executor.execute(
      {
        type: 'DELETE',
        table: HISTORY_TABLE_NAME,
        columns: ['version'],
        where: { '@version': version },
      },
      txId,
    );
  }

  // ─── Resume checkpoints (non-transactional DDL only) ───────────────

  /** Create `_norm_migration_progress` on first use. Only the
   * non-transactional path ever calls this, so Postgres/SQLite
   * databases never grow the table. */
  private async __ensureProgress(): Promise<void> {
    if (this.__progressEnsured) return;
    await this.__runtime.executor.ddl(progressCreateQuery());
    this.__progressEnsured = true;
  }

  /**
   * How many leading actions of `version` already landed.
   *
   * @throws {NormMigrationError} `PLAN_CHANGED` when a checkpoint exists
   *   for a DIFFERENT plan — resuming would skip the wrong statements.
   */
  private async __readProgress(
    version: number,
    planHash: string,
  ): Promise<number> {
    await this.__ensureProgress();
    const res = await this.__runtime.executor.execute<Row>(
      {
        type: 'SELECT',
        table: PROGRESS_TABLE_NAME,
        columns: ['version', 'planHash', 'completed'],
        projection: { '@version': true, '@planHash': true, '@completed': true },
        where: { '@version': version },
      },
    );
    const row = (res.data as Row[])[0];
    if (row === undefined) return 0;
    const stored = String(row.planHash);
    if (stored !== planHash) {
      throw new NormMigrationError(
        `Version ${version} has a partial-apply checkpoint from a ` +
          `DIFFERENT plan (recorded ${stored}, computed ${planHash}) — ` +
          `the snapshots changed since it failed. Reconcile the schema ` +
          `by hand, then delete the row from ${PROGRESS_TABLE_NAME}.`,
        { dir: this.__dir, version, code: 'PLAN_CHANGED' },
      );
    }
    return coerceCount(row.completed);
  }

  /** Record that `completed` actions of `version` have landed. */
  private async __writeProgress(
    version: number,
    planHash: string,
    completed: number,
    exists: boolean,
  ): Promise<void> {
    await this.__ensureProgress();
    const updatedAt = new Date().toISOString();
    if (exists) {
      await this.__runtime.executor.execute({
        type: 'UPDATE',
        table: PROGRESS_TABLE_NAME,
        columns: ['version', 'planHash', 'completed', 'updatedAt'],
        data: { completed, updatedAt },
        where: { '@version': version },
      });
      return;
    }
    await this.__runtime.executor.execute({
      type: 'INSERT',
      table: PROGRESS_TABLE_NAME,
      columns: ['version', 'planHash', 'completed', 'updatedAt'],
      data: { version, planHash, completed, updatedAt },
    });
  }

  /** Drop the checkpoint — the version is fully applied (or reverted). */
  private async __clearProgress(version: number): Promise<void> {
    if (!this.__progressEnsured) return;
    await this.__runtime.executor.execute({
      type: 'DELETE',
      table: PROGRESS_TABLE_NAME,
      columns: ['version'],
      where: { '@version': version },
    });
  }
}

/** Stable fingerprint of a version's action list. Two runs that produce
 * the same actions produce the same hash, which is what makes resuming
 * from a checkpoint safe. */
function actionsHash(actions: ReadonlyArray<MigrationAction>): string {
  return fnv1a64(JSON.stringify(actions));
}

/** Types whose canonical form is a full ISO timestamp string. */
const DATE_ISH = new Set([
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
]);
const JSON_ISH = new Set(['JSON', 'JSONB']);

/** Driver values are already storage-shaped; normalize them into the
 * SAME canonical string form the write path produces
 * (canonicalizePlain) — recomputed digest siblings must byte-match
 * digests written by the repo. Dates arrive as ISO-ish strings from
 * SQL drivers (→ re-normalized through toISOString), JSON as text
 * (→ key-sorted via canonicalizePlain), booleans as 0/1 on SQLite. */
function coerceCanonical(v: unknown, logicalType: string): string {
  if (logicalType === 'BOOLEAN') {
    return v === true || v === 1 || v === '1' || v === 'true'
      ? 'true'
      : 'false';
  }
  if (v instanceof Date) return v.toISOString();
  if (DATE_ISH.has(logicalType) && typeof v === 'string') {
    const d = new Date(v);
    // Unparseable → keep the raw string (loud digest mismatch beats
    // silently digesting 'Invalid Date').
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  if (JSON_ISH.has(logicalType)) {
    if (typeof v === 'string') {
      try {
        return canonicalizePlain(JSON.parse(v), logicalType);
      } catch {
        return v;
      }
    }
    if (typeof v === 'object' && v !== null) {
      return canonicalizePlain(v, logicalType);
    }
  }
  if (typeof v === 'bigint' || typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return canonicalizePlain(v, logicalType);
}

/** Audit fallback: OS user from the environment, if visible. */
function envUser(): string | null {
  try {
    // deno-lint-ignore no-explicit-any
    const env = (globalThis as any).Deno?.env?.toObject?.() ??
      // deno-lint-ignore no-explicit-any
      (globalThis as any).process?.env ?? {};
    return env.USER ?? env.USERNAME ?? null;
  } catch {
    return null;
  }
}
