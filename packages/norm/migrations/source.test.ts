/**
 * Pluggable migration sources and locks: a memorySource applies exactly
 * what the directory does (SQLite, and Postgres when reachable), the
 * database TableLock serializes migrators with no migrations folder, and
 * an apply from memory runs with no recognised runtime at all.
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { isDeno } from '@tundralibs/compat';
import { makeTempDir, readTextFile, removeDir } from '@tundralibs/compat/file';
import { join } from '@tundralibs/compat/path';
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { envArgs } from '@tundralibs/utils';
import '@tundralibs/norm/engines/sqlite';
import '@tundralibs/norm/engines/postgres';
import { Column, Entity, Norm, Schema } from '../mod.ts';
import { NormMigrationError } from '../errors/mod.ts';
import {
  formatVersionFilename,
  HISTORY_TABLE_NAME,
  LOCK_TABLE_NAME,
  memorySource,
  type MigrationSnapshot,
  Migrator,
  PROGRESS_TABLE_NAME,
  TableLock,
} from './mod.ts';

const V1 = {
  Items: Entity('items', {
    id: Column.integer(),
    name: Column.varchar(80),
    qty: Column.bigint(),
  }, { pk: ['id'], index: { byName: ['name'] } }),
};
const V2 = {
  Items: Entity('items', {
    id: Column.integer(),
    title: Column.varchar(80).renamedFrom('name'),
    qty: Column.bigint(),
    note: Column.text().nullable(),
  }, { pk: ['id'], index: { byName: ['title'] } }),
};

type Database = ConstructorParameters<typeof Norm>[0]['database'];

/** Write snapshots 1 (V1) and 2 (V2) to `dir`; return them parsed. */
async function authorSnapshots(
  database: Database,
  dir: string,
): Promise<Record<number, MigrationSnapshot>> {
  const norm = new Norm({ database });
  try {
    await new Migrator(norm.use(Schema('App', V1)), { dir }).snapshot();
    await new Migrator(norm.use(Schema('App', V2)), { dir }).snapshot();
  } finally {
    await norm.disconnect();
  }
  const out: Record<number, MigrationSnapshot> = {};
  for (const v of [1, 2]) {
    out[v] = JSON.parse(
      await readTextFile(`${dir}/${formatVersionFilename(v)}`),
    ) as MigrationSnapshot;
  }
  return out;
}

/** Apply with `options`, then capture history + physical schema. */
async function applyAndCapture(
  database: Database,
  options: ConstructorParameters<typeof Migrator>[1],
  schemaSql: string,
): Promise<{ applied: readonly number[]; history: unknown; schema: unknown }> {
  const norm = new Norm({ database });
  try {
    const db = norm.use(Schema('App', V2));
    for (
      const t of [
        'items',
        HISTORY_TABLE_NAME,
        PROGRESS_TABLE_NAME,
        LOCK_TABLE_NAME,
      ]
    ) await db.raw(`DROP TABLE IF EXISTS ${t}`);
    const { applied } = await new Migrator(db, options).apply();
    const history = (await db.raw(
      `SELECT version, hash FROM ${HISTORY_TABLE_NAME} ORDER BY version`,
    )).data.map((r) => ({ version: Number(r.version), hash: r.hash }));
    return { applied, history, schema: (await db.raw(schemaSql)).data };
  } finally {
    await norm.disconnect();
  }
}

/** memorySource parity: same applied versions, history and schema as the
 * directory it was read from. */
async function assertParity(
  database: Database,
  schemaSql: string,
): Promise<void> {
  const dir = await makeTempDir({ prefix: 'norm-src-' });
  try {
    const snapshots = await authorSnapshots(database, dir);
    const fromDir = await applyAndCapture(database, { dir }, schemaSql);
    const fromMemory = await applyAndCapture(
      database,
      { source: memorySource({ snapshots }) },
      schemaSql,
    );
    asserts.assertEquals(fromDir.applied, [1, 2]);
    asserts.assertEquals(fromMemory, fromDir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
}

const SQLITE_SCHEMA = `SELECT type, name, sql FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' AND name <> '${LOCK_TABLE_NAME}'
  ORDER BY type, name`;

describe('norm.migrations sources', () => {
  let dbDir = '';
  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-src-db-' });
  });
  afterAll(async () => {
    await removeDir(dbDir, { recursive: true });
  });

  it('memorySource applies 1→2 exactly as the directory did (SQLite)', async () => {
    await assertParity({ dialect: 'sqlite', path: dbDir }, SQLITE_SCHEMA);
  });

  it('snapshot() and renderPlans() refuse a read-only source', async () => {
    const norm = new Norm({ database: { dialect: 'sqlite', path: dbDir } });
    try {
      const mig = new Migrator(norm.use(Schema('App', V1)), {
        source: memorySource({ snapshots: {} }),
      });
      for (const call of [() => mig.snapshot(), () => mig.renderPlans()]) {
        const err = await asserts.assertRejects(call, NormMigrationError);
        asserts.assertEquals(err.code, 'READ_ONLY_SOURCE');
      }
    } finally {
      await norm.disconnect();
    }
  });

  it('memorySource rejects a non-integer version key', () => {
    asserts.assertThrows(
      () =>
        memorySource({
          snapshots: { 1.5: {} as MigrationSnapshot },
        }),
      TypeError,
    );
  });
});

const env = envArgs('./packages/norm/');
const PG_SERVER = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_norm`
    : env.get('POSTGRES_DB') || 'postgres',
  username: env.get('POSTGRES_USERNAME') || env.get('POSTGRES_USER') ||
    'postgres',
  password: env.get('POSTGRES_PASSWORD') || '',
};
/** A throwaway database, so the history table compared here is not the
 * one the other live Postgres suites share (they run in parallel). */
const PG_DB = `norm_src_${crypto.randomUUID().slice(0, 8)}`;
const pgAdmin = async <T>(fn: (e: PostgresEngine) => Promise<T>) => {
  const e = new PostgresEngine('norm-src-pg-admin', PG_SERVER);
  try {
    await e.connect();
    return await fn(e);
  } finally {
    await e.disconnect().catch(() => {});
  }
};
const pgAvailable = await pgAdmin((e) =>
  e.execute({ sql: `CREATE DATABASE ${PG_DB}` })
).then(() => true, () => false);

describe('norm.migrations sources (Postgres)', () => {
  afterAll(async () => {
    if (pgAvailable) {
      await pgAdmin((e) => e.execute({ sql: `DROP DATABASE ${PG_DB}` }));
    }
  });

  it(
    pgAvailable
      ? 'memorySource applies 1→2 exactly as the directory did (Postgres)'
      : `SKIPPED — Postgres at ${PG_SERVER.host}:${PG_SERVER.port} unavailable`,
    async () => {
      if (!pgAvailable) return;
      await assertParity(
        { dialect: 'postgres', ...PG_SERVER, database: PG_DB },
        `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
            (SELECT string_agg(indexdef, '; ' ORDER BY indexname)
               FROM pg_indexes i
              WHERE i.schemaname = current_schema()
                AND i.tablename = c.table_name) AS indexes
           FROM information_schema.columns c
          WHERE c.table_schema = current_schema()
            AND c.table_name IN ('items', '${HISTORY_TABLE_NAME}')
          ORDER BY c.table_name, c.column_name`,
      );
    },
  );
});

describe('norm.migrations TableLock (SQLite)', () => {
  let dbDir = '';
  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-tlock-' });
  });
  afterAll(async () => {
    await removeDir(dbDir, { recursive: true });
  });

  it('a held lock times a contender out; release frees it', async () => {
    const norm = new Norm({ database: { dialect: 'sqlite', path: dbDir } });
    try {
      const db = norm.use(Schema('App', V1));
      const a = new TableLock(db);
      const b = new TableLock(db);
      await a.acquire();
      const err = await asserts.assertRejects(
        () => b.acquire(250),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'LOCK_TIMEOUT');
      await a.release();
      await b.acquire(250);
      asserts.assertEquals(b.held, true);
      await b.release();
    } finally {
      await norm.disconnect();
    }
  });

  it('a row left by a killed process is reclaimed after staleMs', async () => {
    const norm = new Norm({ database: { dialect: 'sqlite', path: dbDir } });
    try {
      const db = norm.use(Schema('App', V1));
      const dead = new TableLock(db, 60_000);
      await dead.acquire(); // never released: the process "died"
      await db.raw(`UPDATE ${LOCK_TABLE_NAME} SET stampedAt = :t:`, {
        t: Date.now() - 3_600_000,
      });
      const next = new TableLock(db, 60_000);
      await next.acquire(500); // reclaims instead of timing out
      asserts.assertEquals(next.held, true);
      // touch() keeps a live holder from being reclaimed.
      await next.touch();
      await asserts.assertRejects(
        () => new TableLock(db, 60_000).acquire(250),
        NormMigrationError,
      );
      await next.release();
    } finally {
      await norm.disconnect();
    }
  });

  it('concurrent migrators on one file apply each version exactly once', async () => {
    const snapDir = await makeTempDir({ prefix: 'norm-tlock-snaps-' });
    const database = { dialect: 'sqlite' as const, path: dbDir };
    // One name → one engine subdirectory → one shared main.db file.
    const norms = Array.from(
      { length: 4 },
      () => new Norm({ name: 'shared', database }),
    );
    try {
      const snapshots = await authorSnapshots(database, snapDir);
      const run = (norm: Norm) =>
        new Migrator(norm.use(Schema('App', V2)), {
          source: memorySource({ snapshots }),
        }).apply();
      const results = await Promise.all(norms.map(run));
      asserts.assertEquals(results.flatMap((r) => r.applied).sort(), [1, 2]);
      const history = await norms[0]!.use(Schema('App', V2)).raw(
        `SELECT version FROM ${HISTORY_TABLE_NAME} ORDER BY version`,
      );
      asserts.assertEquals(history.data.map((r) => Number(r.version)), [1, 2]);
    } finally {
      for (const norm of norms) await norm.disconnect();
      await removeDir(snapDir, { recursive: true });
    }
  });
});

// The bot case: a runtime with none of Deno / Node / Bun, where compat's
// file functions throw. A child process deletes those globals before
// importing anything, opens SQLite through a host-provided binding (the
// protected `_openDatabase` hook) and applies from a memorySource — so a
// successful apply proves the path never reached `@tundralibs/compat/file`.
// Deno-gated because it spawns the child with `Deno.Command`.
if (isDeno) {
  describe('norm.migrations memorySource (no recognised runtime)', () => {
    it('apply() never reaches compat/file', async () => {
      const script = `// deno-lint-ignore-file no-explicit-any
const { DatabaseSync } = await import('node:sqlite');
const g = globalThis as any;
for (const k of ['process', 'Buffer', 'global', 'setImmediate', 'clearImmediate', 'Deno']) delete g[k];
const { RUNTIME } = await import('../../../compat/runtime.ts');
const { readTextFile } = await import('../../../compat/file.ts');
const fileError = await readTextFile('x').then(() => 'none', (e: Error) => e.name);
const { SQLiteEngine } = await import('../../../drivers/engines/sqlite/mod.ts');
const { registerEngine } = await import('../../engines/mod.ts');
const { Column, Entity, Norm, Schema } = await import('../../core.ts');
const { buildSnapshot, memorySource, Migrator } = await import('../mod.ts');
const { runtimeOf } = await import('../../Norm.ts');

class HostSqlite extends SQLiteEngine {
  protected override _openDatabase(): any {
    const db = new DatabaseSync(':memory:');
    return {
      exec: (sql: string) => db.exec(sql),
      prepare: (sql: string) => {
        const st = db.prepare(sql);
        return {
          all: (p: unknown[]) => st.all(...(p as [])),
          run: (p: unknown[]) => ({ changes: Number(st.run(...(p as [])).changes) }),
        };
      },
      close: () => db.close(),
    };
  }
}
registerEngine('sqlite', () => new HostSqlite('bare', { path: ':memory:' }) as never);
const norm = new Norm({ database: { dialect: 'sqlite', path: ':memory:' } });
const db = norm.use(Schema('App', {
  Items: Entity('items', { id: Column.integer(), qty: Column.bigint() }, { pk: ['id'] }),
}));
const snap = buildSnapshot(runtimeOf(db).registry, new Date().toISOString());
const res = await new Migrator(db, { source: memorySource({ snapshots: { 1: snap } }) }).apply();
const rows = await db.raw("SELECT name FROM sqlite_master WHERE name = 'items'");
console.log(JSON.stringify({ RUNTIME, fileError, applied: res.applied, tables: rows.data.length }));
`;
      const scriptPath = join(
        import.meta.dirname!,
        'fixtures',
        'bare-runtime-apply.ts',
      );
      await Deno.writeTextFile(scriptPath, script);
      let out;
      try {
        out = await new Deno.Command(Deno.execPath(), {
          args: ['run', '--allow-read', scriptPath],
          stdout: 'piped',
          stderr: 'piped',
        }).output();
      } finally {
        await Deno.remove(scriptPath);
      }
      const stderr = new TextDecoder().decode(out.stderr);
      asserts.assertEquals(out.code, 0, stderr);
      asserts.assertEquals(
        JSON.parse(
          new TextDecoder().decode(out.stdout).trim().split('\n').at(-1)!,
        ),
        {
          RUNTIME: 'UNKNOWN',
          fileError: 'UnsupportedRuntimeError',
          applied: [1],
          tables: 1,
        },
      );
    });
  });
}
