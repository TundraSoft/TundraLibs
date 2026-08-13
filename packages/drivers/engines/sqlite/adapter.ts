/**
 * @fileoverview Runtime-branched adapter for the per-runtime SQLite library.
 *
 * SQLite is an embedded library (no wire protocol), so each runtime ships
 * its own bindings:
 * - **Deno**: `jsr:@db/sqlite` (FFI to libsqlite)
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
  return db;
}

//#region Deno backend (jsr:@db/sqlite)

async function _openDeno(
  path: string,
  options: OpenOptions,
): Promise<SqliteDb> {
  // The `as string` cast keeps non-Deno runtimes from trying to statically
  // resolve this specifier.
  const mod = await import('$sqlite_deno' as string);
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

/**
 * Rewrite `:name` bind placeholders to bun:sqlite's `$name` form, skipping
 * anything inside a single-quoted string literal, a quoted identifier
 * (`"..."`, `` `...` ``, or `[...]`), or a comment. SQLite's own parser (used
 * by the Deno/Node bindings) never treats `:name` inside a quoted span as a
 * parameter, so neither may we — otherwise `strftime('%H:%M', ...)`,
 * `WHERE code = 'AB:CD'`, or an identifier like `[a:b]` / `` `a:b` `` would be
 * corrupted on Bun only.
 *
 * SQLite escaping rules honoured: `''` inside a single-quoted string, `""`
 * inside a double-quoted identifier, and `` `` `` inside a backtick identifier
 * are literal quote characters, not terminators. A `[...]` bracket identifier
 * has no escape — the first `]` closes it (SQLite's MS-Access/T-SQL-compat
 * quoting).
 */
export function _rewriteBunPlaceholders(sql: string): string {
  let out = '';
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const ch = sql[i]!;

    // Single-quoted string literal — copy verbatim (handle '' escape).
    if (ch === "'") {
      out += ch;
      i++;
      while (i < n) {
        out += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted identifier — copy verbatim (handle "" escape).
    if (ch === '"') {
      out += ch;
      i++;
      while (i < n) {
        out += sql[i];
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Backtick-quoted identifier — copy verbatim (handle `` escape). SQLite
    // accepts backtick identifiers for MySQL compatibility.
    if (ch === '`') {
      out += ch;
      i++;
      while (i < n) {
        out += sql[i];
        if (sql[i] === '`') {
          if (sql[i + 1] === '`') {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Bracket-quoted identifier `[...]` — copy verbatim. SQLite accepts these
    // for MS-Access/T-SQL compatibility; there is no escape sequence, so the
    // first `]` closes the identifier.
    if (ch === '[') {
      out += ch;
      i++;
      while (i < n) {
        out += sql[i];
        if (sql[i] === ']') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Line comment `-- ... <EOL>` — copy verbatim.
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') {
        out += sql[i];
        i++;
      }
      continue;
    }

    // Block comment `/* ... */` — copy verbatim.
    if (ch === '/' && sql[i + 1] === '*') {
      out += '/*';
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) {
        out += sql[i];
        i++;
      }
      if (i < n) {
        out += '*/';
        i += 2;
      }
      continue;
    }

    // `:name` placeholder (letter/underscore first). Anything else is copied
    // as-is, which also leaves `::casts` and time literals outside strings
    // untouched — the base standardizer already resolved `:name:` params.
    if (ch === ':' && i + 1 < n && /[A-Za-z_]/.test(sql[i + 1]!)) {
      let j = i + 1;
      while (j < n && /\w/.test(sql[j]!)) j++;
      out += '$' + sql.slice(i + 1, j);
      i = j;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

// deno-lint-ignore no-explicit-any
function _wrapBun(db: any): SqliteDb {
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      // bun:sqlite uses `$name` placeholders, not `:name`. Rewrite the SQL
      // and prepend `$` to parameter object keys to match. The rewrite is
      // string/comment-aware: a bare `sql.replaceAll(/:name/)` also mangles
      // `:name` sequences *inside* string literals (e.g. strftime('%H:%M')
      // → '%H$M') and comments, which the Deno/Node bindings never do — a
      // silent Bun-only divergence in a library whose contract is identical
      // behaviour across runtimes.
      const bunSql = _rewriteBunPlaceholders(sql);
      const stmt = db.prepare(bunSql);
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
          out[k.startsWith('$') ? k : `$${k}`] = v;
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
  // 1. Try the built-in. The cast keeps non-Node runtimes from resolving.
  try {
    const mod = await import('node:sqlite' as string);
    const Database = mod.DatabaseSync ?? mod.default?.DatabaseSync;
    if (Database) {
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
            { runtime: 'node', path },
          );
        }
      }
      const db = new Database(path, {
        readOnly: options.readonly ?? false,
      });
      return _wrapNodeStmt(db);
    }
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
