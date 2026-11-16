/**
 * @fileoverview Runtime-branched adapter for the per-runtime SQLite library.
 *
 * SQLite is an embedded library (no wire protocol), so each runtime ships
 * its own bindings:
 * - **Deno**: `jsr:@db/sqlite` (FFI to libsqlite), or the built-in
 *   `node:sqlite` when drivers was installed from npm
 * - **Bun**: `bun:sqlite` (built-in, zero deps)
 * - **Node.js**: `npm:better-sqlite3` (native module)
 *
 * This module exposes a uniform `SqliteDb` / `SqliteStmt` interface and
 * dynamically loads the right backend at runtime.
 *
 * @module
 */

import { pathExistsSync } from '@tundralibs/compat/file';
import { isBun, isDeno, isNode } from '@tundralibs/compat/runtime';
import { DriverError } from '../../errors/mod.ts';

/** Uniform shape of a SQLite database handle across runtimes. */
export type SqliteDb = {
  /** Execute one or more SQL statements (no parameters, no result). */
  exec(sql: string): void;
  /** Prepare a parameterized statement. */
  prepare(sql: string): SqliteStmt;
  /** Close the database file. Safe to call multiple times. */
  close(): void;
};

/** Uniform shape of a prepared SQLite statement. */
export type SqliteStmt = {
  /** Execute the statement and return all result rows. */
  all(params: ReadonlyArray<unknown>): Record<string, unknown>[];
  /** Execute the statement and return the number of affected rows. */
  run(
    params: ReadonlyArray<unknown>,
  ): { changes: number; lastInsertRowid?: number };
  /** Optional finalizer; some bindings need explicit cleanup. */
  finalize?(): void;
};

/** Open options understood by every backend. */
export type OpenOptions = {
  readonly?: boolean;
  create?: boolean;
  /** `PRAGMA busy_timeout` in ms (default 0 — fail at once). */
  busyTimeoutMs?: number;
};

/**
 * Uniform INTEGER read contract across backends: `number` when the
 * value is exactly representable, `bigint` only beyond ±(2^53 − 1).
 *
 * Deno's @db/sqlite (`int64: true`) already behaves this way. Bun and
 * Node need their safe-integer read modes ON (without them bun:sqlite
 * silently rounds to float64 and node:sqlite throws a RangeError on
 * big values) — but those modes return bigint for EVERY integer, so
 * this downgrades the safely-representable ones back to `number`.
 */
const _MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function _downgradeSafeBigints(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (typeof v === 'bigint' && v <= _MAX_SAFE && v >= -_MAX_SAFE) {
        row[k] = Number(v);
      }
    }
  }
  return rows;
}

/**
 * Open a SQLite database, dispatching to the right runtime-native binding.
 *
 * @throws Error if no backend is available for the current runtime.
 */
export async function openDatabase(
  path: string,
  options: OpenOptions = {},
): Promise<SqliteDb> {
  const busyTimeoutMs = options.busyTimeoutMs ?? 0;
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
    throw new DriverError(
      `busyTimeoutMs must be a non-negative integer, got ${busyTimeoutMs}`,
      { runtime: isDeno ? 'deno' : isBun ? 'bun' : 'node' },
    );
  }
  const db = isDeno
    ? await _openDeno(path, options)
    : isBun
    ? _openBun(path, options)
    : isNode
    ? await _openNode(path, options)
    : undefined;
  if (db === undefined) {
    throw new DriverError(
      'No SQLite backend available for this runtime',
      { runtime: 'unknown' },
    );
  }
  // Enforce foreign keys UNIFORMLY: SQLite ships the pragma OFF, and
  // the runtimes disagree on the default (Deno @db/sqlite + node:sqlite
  // enable it, bun:sqlite does NOT) — so FK constraints incl. ON DELETE
  // CASCADE were silently unenforced on Bun. It is a per-connection
  // setting; readonly connections accept it (no file write).
  db.exec('PRAGMA foreign_keys = ON');
  // Set UNIFORMLY too: the bindings disagree (better-sqlite3 waits 5s,
  // the others fail at once). The wait is synchronous, so it only helps
  // against ANOTHER process — in-process it blocks the holder as well.
  db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  return db;
}

//#region Deno backend (jsr:@db/sqlite)

/**
 * Open on Deno. `load` is injectable so tests can simulate the npm
 * install, where the `$sqlite_deno` alias does not resolve.
 */
export async function _openDeno(
  path: string,
  options: OpenOptions,
  // The `as string` cast keeps non-Deno runtimes from trying to statically
  // resolve this specifier.
  load: () => Promise<unknown> = () => import('$sqlite_deno' as string),
): Promise<SqliteDb> {
  // deno-lint-ignore no-explicit-any
  let mod: any;
  try {
    mod = await load();
  } catch (e) {
    // Installed from npm (`@jsr/tundralibs__drivers` in node_modules), the
    // alias is unresolvable: Deno applies no import map inside node_modules
    // and rejects a `jsr:` specifier there. Deno ships `node:sqlite`.
    if ((e as { code?: unknown }).code !== 'ERR_MODULE_NOT_FOUND') throw e;
    const db = await _openNodeSqlite(path, options, 'deno');
    if (db === undefined) throw e;
    return db;
  }
  // jsr:@db/sqlite exports `Database` (default-style class).
  const Database = mod.Database ?? mod.default;
  const db = new Database(path, {
    readonly: options.readonly ?? false,
    create: options.create ?? true,
    // Without int64, @db/sqlite silently TRUNCATES bigint parameter
    // binds to their low 32 bits (2^60 stores as 0) — silent data
    // corruption. With it, binds are lossless int64; reads return
    // plain numbers within Number.MAX_SAFE_INTEGER and bigint beyond.
    int64: true,
  });
  return _wrapDeno(db);
}

// deno-lint-ignore no-explicit-any
function _wrapDeno(db: any): SqliteDb {
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        all: (params) => stmt.all(...params) as Record<string, unknown>[],
        run: (params) => {
          const changes = stmt.run(...params);
          return { changes };
        },
        finalize: () => stmt.finalize?.(),
      };
    },
    close: () => db.close(),
  };
}

//#endregion Deno backend

//#region Bun backend (bun:sqlite)

function _openBun(path: string, options: OpenOptions): SqliteDb {
  // `bun:sqlite` is a synchronous built-in. We use a dynamic import that
  // Deno/Node don't try to resolve.
  const Database = (globalThis as { Bun?: unknown }).Bun
    ? (require('bun:sqlite') as {
      Database: new (path: string, opts?: unknown) => unknown;
    }).Database
    : null;
  if (!Database) {
    throw new DriverError(
      'bun:sqlite is unavailable in this Bun build',
      { runtime: 'bun' },
    );
  }
  // SQLite open flags:
  //   READONLY = 0x01, READWRITE = 0x02, CREATE = 0x04
  // Readonly is mutually exclusive with create — SQLite rejects
  // `READONLY | CREATE` with SQLITE_MISUSE. Only OR in CREATE on the
  // readwrite path.
  let flags: number;
  if (options.readonly) {
    flags = 0x01;
  } else {
    flags = 0x02;
    if (options.create !== false) flags |= 0x04;
  }
  const db = new Database(path, flags);
  return _wrapBun(db);
}

// deno-lint-ignore no-explicit-any
function _wrapBun(db: any): SqliteDb {
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      // The SQL keeps its `:name` placeholders, so SQLite's own parser
      // finds them, as on Deno and Node. bun:sqlite binds an object by the
      // key with its prefix, so each key gets its `:`.
      const stmt = db.prepare(sql);
      // Lossless int64 reads (bind side is already lossless). Chainable;
      // see _downgradeSafeBigints for the uniform contract.
      stmt.safeIntegers?.(true);
      const renameKeys = (
        params: ReadonlyArray<unknown>,
      ): unknown[] => {
        if (params.length === 0) return [];
        const first = params[0];
        if (
          typeof first !== 'object' || first === null || Array.isArray(first)
        ) {
          return params as unknown[];
        }
        const out: Record<string, unknown> = {};
        for (
          const [k, v] of Object.entries(first as Record<string, unknown>)
        ) {
          out[`:${k}`] = v;
        }
        return [out, ...params.slice(1)];
      };
      return {
        all: (params) =>
          _downgradeSafeBigints(
            stmt.all(...renameKeys(params)) as Record<string, unknown>[],
          ),
        run: (params) => {
          const r = stmt.run(...renameKeys(params));
          // safeIntegers makes run() metadata bigint too — coerce back.
          return {
            changes: Number(r.changes ?? 0),
            lastInsertRowid: r.lastInsertRowid === undefined
              ? undefined
              : Number(r.lastInsertRowid),
          };
        },
        finalize: () => stmt.finalize?.(),
      };
    },
    close: () => db.close(),
  };
}

//#endregion Bun backend

//#region Node backend (built-in `node:sqlite` first, fallback to `better-sqlite3`)

/**
 * Open a SQLite database on Node, preferring the built-in `node:sqlite`
 * module (Node 22.5+ with `--experimental-sqlite`, stable in 23+, default
 * in 24+). Falls back to `npm:better-sqlite3` if the built-in is unavailable
 * (older Node, or 22.x without the flag).
 *
 * Both bindings expose a near-identical `prepare`/`all`/`run`/`exec`/`close`
 * surface, so the same wrapper works for both.
 */
async function _openNode(
  path: string,
  options: OpenOptions,
): Promise<SqliteDb> {
  // 1. Try the built-in.
  try {
    const db = await _openNodeSqlite(path, options, 'node');
    if (db !== undefined) return db;
  } catch (e) {
    // node:sqlite unavailable (pre-22.5 or 22.x without --experimental-sqlite),
    // OR our `create: false` precheck rejected the open. Surface the latter
    // as-is; let the former fall through to better-sqlite3.
    if (
      e instanceof DriverError && e.message.startsWith('SQLite file not found:')
    ) {
      throw e;
    }
  }

  // 2. Fall back to better-sqlite3 (optional dep).
  try {
    const mod = await import('better-sqlite3' as string);
    const Database = mod.default ?? mod;
    const db = new Database(path, {
      readonly: options.readonly ?? false,
      fileMustExist: options.create === false,
    });
    return _wrapNodeStmt(db);
  } catch {
    throw new DriverError(
      'SQLite is unavailable on Node. Either run Node 22.5+ with ' +
        '`--experimental-sqlite` (or Node 23+ where it is stable) ' +
        'OR install `better-sqlite3` (`npm install better-sqlite3`).',
      { runtime: 'node' },
    );
  }
}

/**
 * Open through the built-in `node:sqlite` (Node, and Deno's npm-install
 * path). Resolves `undefined` when the module is unavailable.
 */
async function _openNodeSqlite(
  path: string,
  options: OpenOptions,
  runtime: 'node' | 'deno',
): Promise<SqliteDb | undefined> {
  // The cast keeps non-Node runtimes from resolving statically.
  // deno-lint-ignore no-explicit-any
  let mod: any;
  try {
    mod = await import('node:sqlite' as string);
  } catch {
    return undefined;
  }
  const Database = mod.DatabaseSync ?? mod.default?.DatabaseSync;
  if (!Database) return undefined;
  // `node:sqlite` always creates if the file is missing — there's no
  // built-in `fileMustExist` toggle. Honor `options.create === false`
  // by checking existence ourselves first.
  if (
    options.create === false && path !== ':memory:' &&
    !path.startsWith('file::memory:')
  ) {
    if (!pathExistsSync(path)) {
      throw new DriverError(
        `SQLite file not found: ${path}`,
        { runtime, path },
      );
    }
  }
  const db = new Database(path, { readOnly: options.readonly ?? false });
  return _wrapNodeStmt(db);
}

/**
 * Wrap a Node-style SQLite database (better-sqlite3 OR node:sqlite —
 * the surface is intentionally similar across both).
 */
// deno-lint-ignore no-explicit-any
function _wrapNodeStmt(db: any): SqliteDb {
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      // Lossless int64 reads — node:sqlite spells it setReadBigInts,
      // better-sqlite3 spells it safeIntegers. Without it node:sqlite
      // THROWS a RangeError reading values beyond 2^53 − 1.
      stmt.setReadBigInts?.(true);
      stmt.safeIntegers?.(true);
      return {
        all: (params) =>
          _downgradeSafeBigints(
            stmt.all(...params) as Record<string, unknown>[],
          ),
        run: (params) => {
          const r = stmt.run(...params);
          // Big-int read mode makes run() metadata bigint too — coerce.
          return {
            changes: Number(r.changes ?? 0),
            lastInsertRowid: r.lastInsertRowid === undefined
              ? undefined
              : Number(r.lastInsertRowid),
          };
        },
      };
    },
    close: () => db.close(),
  };
}

//#endregion Node backend
