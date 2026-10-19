/**
 * @fileoverview Tests for SQLite adapter (openDatabase + runtime wrappers).
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { isDeno } from '@tundralibs/compat';
import { makeTempDir, remove } from '@tundralibs/compat/file';
import { join } from '@tundralibs/compat/path';
import { _openDeno, _rewriteBunPlaceholders, openDatabase } from './adapter.ts';

// =============================================================================
// Test Suites
// =============================================================================

describe({
  name: 'drivers.sqlite.adapter',
  sanitizeResources: false, // SQLite FFI library stays loaded
  fn: () => {
    describe({
      name: 'openDatabase() - runtime-native binding',
      fn: () => {
        it('should open an in-memory database', async () => {
          const db = await openDatabase(':memory:');
          asserts.assert(db !== undefined);
          asserts.assertStrictEquals(typeof db.exec, 'function');
          asserts.assertStrictEquals(typeof db.prepare, 'function');
          asserts.assertStrictEquals(typeof db.close, 'function');
          db.close();
        });

        it('should execute DDL via exec()', async () => {
          const db = await openDatabase(':memory:');
          try {
            db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
            db.exec("INSERT INTO t VALUES (1, 'hello')");
          } finally {
            db.close();
          }
        });

        it('should prepare and run all() returning rows', async () => {
          const db = await openDatabase(':memory:');
          try {
            db.exec('CREATE TABLE t (id INTEGER, val TEXT)');
            db.exec("INSERT INTO t VALUES (1, 'a')");
            db.exec("INSERT INTO t VALUES (2, 'b')");
            const stmt = db.prepare('SELECT * FROM t WHERE id = ?');
            const rows = stmt.all([1]);
            asserts.assertStrictEquals(rows.length, 1);
            asserts.assertStrictEquals(rows[0]!.val, 'a');
          } finally {
            db.close();
          }
        });

        it('should prepare and run run() returning changes', async () => {
          const db = await openDatabase(':memory:');
          try {
            db.exec('CREATE TABLE t (id INTEGER, val TEXT)');
            db.exec("INSERT INTO t VALUES (1, 'a')");
            const stmt = db.prepare('UPDATE t SET val = ? WHERE id = ?');
            const result = stmt.run(['b', 1]);
            asserts.assertStrictEquals(result.changes, 1);
          } finally {
            db.close();
          }
        });

        it('should call finalize on statement if available', async () => {
          const db = await openDatabase(':memory:');
          try {
            db.exec('CREATE TABLE t (id INTEGER)');
            const stmt = db.prepare('SELECT * FROM t');
            // finalize may or may not exist depending on the Deno SQLite binding
            stmt.finalize?.();
          } finally {
            db.close();
          }
        });

        it('should respect readonly option', async () => {
          const tempDir = await makeTempDir({ prefix: 'adapter_test_' });
          const dbPath = `${tempDir}/test.db`;
          try {
            // Create the db first
            const db = await openDatabase(dbPath, { create: true });
            db.exec('CREATE TABLE t (id INTEGER)');
            db.close();

            // Now open readonly
            const roDb = await openDatabase(dbPath, { readonly: true });
            try {
              asserts.assert(roDb !== undefined);
            } finally {
              roDb.close();
            }
          } finally {
            await remove(tempDir);
          }
        });

        it('should open with create: true option', async () => {
          const tempDir = await makeTempDir({
            prefix: 'adapter_create_',
          });
          const dbPath = `${tempDir}/new.db`;
          try {
            const db = await openDatabase(dbPath, { create: true });
            asserts.assert(db !== undefined);
            db.close();
          } finally {
            await remove(tempDir);
          }
        });
      },
    });

    describe({
      name: 'openDatabase() - unknown runtime fallback',
      deno: true,
      bun: false,
      node: false,
      fn: () => {
        it('should be tested only when isDeno is true', () => {
          // This validates the current runtime detection
          asserts.assertStrictEquals(isDeno, true);
        });
      },
    });

    // Installed from npm, Deno cannot resolve the `$sqlite_deno` alias inside
    // node_modules (ERR_MODULE_NOT_FOUND) — the adapter must fall back to
    // Deno's built-in node:sqlite with the same INTEGER read contract.
    describe({
      name: '_openDeno() - $sqlite_deno unresolvable (npm install)',
      deno: true,
      bun: false,
      node: false,
      fn: () => {
        const unresolved = () =>
          Promise.reject(
            Object.assign(new TypeError("Could not find '$sqlite_deno'"), {
              code: 'ERR_MODULE_NOT_FOUND',
            }),
          );

        it('falls back to node:sqlite', async () => {
          const db = await _openDeno(':memory:', {}, unresolved);
          try {
            const rows = db.prepare('SELECT 1 AS a, 9007199254740993 AS b')
              .all([]);
            asserts.assertEquals(rows[0], { a: 1, b: 9007199254740993n });
          } finally {
            db.close();
          }
        });

        it('rethrows any other load failure', async () => {
          const denied = new Error('ffi permission denied');
          const err = await asserts.assertRejects(() =>
            _openDeno(':memory:', {}, () => Promise.reject(denied))
          );
          asserts.assertStrictEquals(err, denied);
        });
      },
    });
  },
});

// busy_timeout only matters against ANOTHER process (the bindings are
// synchronous, so an in-process wait blocks the holder too). A child
// holds `BEGIN IMMEDIATE` on a shared file; the parent's write must fail
// at once by default and wait the lock out with `busyTimeoutMs`.
// Deno-gated: it spawns the child with `Deno.Command`.
if (isDeno) {
  describe({
    name: 'drivers.sqlite.adapter busyTimeoutMs (across processes)',
    sanitizeResources: false,
    fn: () => {
      it('0 fails at once; a timeout waits out the other writer', async () => {
        const dir = await makeTempDir({ prefix: 'sqlite-busy-' });
        const file = join(dir, 'main.db');
        const script = join(import.meta.dirname!, 'fixtures', 'hold.ts');
        await Deno.writeTextFile(
          script,
          `const { openDatabase } = await import('../adapter.ts');
const db = await openDatabase(Deno.args[0]);
db.exec('BEGIN IMMEDIATE');
console.log('locked');
await new Promise((r) => setTimeout(r, Number(Deno.args[1])));
db.exec('COMMIT');
db.close();
`,
        );
        /** Spawn the holder; resolve once it holds the write lock. */
        const hold = async (ms: number) => {
          const child = new Deno.Command(Deno.execPath(), {
            args: ['run', '-A', script, file, String(ms)],
            stdout: 'piped',
            stderr: 'inherit',
          }).spawn();
          const reader = child.stdout.getReader();
          let seen = '';
          while (!seen.includes('locked')) {
            const { value, done } = await reader.read();
            if (done) throw new Error('holder exited before locking');
            seen += new TextDecoder().decode(value);
          }
          reader.releaseLock();
          await child.stdout.cancel();
          return child;
        };
        try {
          const setup = await openDatabase(file);
          setup.exec('CREATE TABLE t (n INTEGER)');
          setup.close();

          let holder = await hold(1500);
          const eager = await openDatabase(file);
          asserts.assertThrows(
            () => eager.exec('INSERT INTO t VALUES (1)'),
            Error,
            'locked',
          );
          eager.close();
          await holder.status;

          holder = await hold(300);
          const patient = await openDatabase(file, { busyTimeoutMs: 10_000 });
          patient.exec('INSERT INTO t VALUES (2)'); // blocks until COMMIT
          asserts.assertEquals(
            patient.prepare('SELECT n FROM t').all([]),
            [{ n: 2 }],
          );
          patient.close();
          await holder.status;
        } finally {
          await Deno.remove(script);
          await remove(dir);
        }
      });

      it('rejects a negative or fractional busyTimeoutMs', async () => {
        for (const busyTimeoutMs of [-1, 1.5]) {
          await asserts.assertRejects(() =>
            openDatabase(':memory:', { busyTimeoutMs })
          );
        }
      });
    },
  });
}

// Regression (round-3 finding #11): the Bun placeholder rewrite `:name` →
// `$name` must be string/comment-aware. A naive `replaceAll(/:name/)` also
// mangles `:name` sequences inside quoted literals (e.g. `'%H:%M'` → `'%H$M'`)
// — a silent Bun-only divergence from the Deno/Node bindings, whose SQLite
// parsers never touch quoted text. Pure-function test: runs on every runtime.
describe('drivers.sqlite.adapter._rewriteBunPlaceholders', () => {
  it('rewrites bind placeholders outside string literals', () => {
    asserts.assertEquals(
      _rewriteBunPlaceholders('SELECT * FROM t WHERE id = :id AND n = :name'),
      'SELECT * FROM t WHERE id = $id AND n = $name',
    );
  });

  it('leaves :word inside a single-quoted literal untouched', () => {
    // strftime time format — the headline scenario.
    asserts.assertEquals(
      _rewriteBunPlaceholders(
        "SELECT strftime('%H:%M', created_at) AS hhmm FROM events",
      ),
      "SELECT strftime('%H:%M', created_at) AS hhmm FROM events",
    );
    // A literal that looks like a placeholder must stay literal (else the
    // query silently returns zero rows on Bun).
    asserts.assertEquals(
      _rewriteBunPlaceholders("SELECT * FROM parts WHERE code = 'AB:CD'"),
      "SELECT * FROM parts WHERE code = 'AB:CD'",
    );
  });

  it('still rewrites a real placeholder that follows a quoted literal', () => {
    asserts.assertEquals(
      _rewriteBunPlaceholders(
        "SELECT * FROM t WHERE label = 'a:b' AND id = :id",
      ),
      "SELECT * FROM t WHERE label = 'a:b' AND id = $id",
    );
  });

  it("honours '' escapes inside single-quoted literals", () => {
    asserts.assertEquals(
      _rewriteBunPlaceholders("SELECT ':x''y:z' AS s, :real"),
      "SELECT ':x''y:z' AS s, $real",
    );
  });

  it('leaves :word inside a double-quoted identifier untouched', () => {
    asserts.assertEquals(
      _rewriteBunPlaceholders('SELECT "col:with:colons" FROM t WHERE id = :id'),
      'SELECT "col:with:colons" FROM t WHERE id = $id',
    );
  });

  it('leaves :word inside a backtick-quoted identifier untouched', () => {
    asserts.assertEquals(
      _rewriteBunPlaceholders('SELECT `col:with:colons` FROM t WHERE id = :id'),
      'SELECT `col:with:colons` FROM t WHERE id = $id',
    );
  });

  it('honours `` escapes inside backtick identifiers', () => {
    // A doubled backtick is a literal backtick, not a terminator: the :y
    // stays inside the identifier and only the trailing :real is rewritten.
    asserts.assertEquals(
      _rewriteBunPlaceholders('SELECT `a``b:y` AS c, :real FROM t'),
      'SELECT `a``b:y` AS c, $real FROM t',
    );
  });

  it('leaves :word inside a [bracket] identifier untouched', () => {
    asserts.assertEquals(
      _rewriteBunPlaceholders('SELECT [col:with:colons] FROM t WHERE id = :id'),
      'SELECT [col:with:colons] FROM t WHERE id = $id',
    );
  });

  it('leaves :word inside line and block comments untouched', () => {
    asserts.assertEquals(
      _rewriteBunPlaceholders('SELECT :id -- not a :param here\nFROM t'),
      'SELECT $id -- not a :param here\nFROM t',
    );
    asserts.assertEquals(
      _rewriteBunPlaceholders('SELECT /* :nope */ :id FROM t'),
      'SELECT /* :nope */ $id FROM t',
    );
  });
});
