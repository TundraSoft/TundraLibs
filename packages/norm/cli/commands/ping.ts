/**
 * @fileoverview `norm ping [dir]` — open the connection described by
 * configs/Norm.yaml and report success/failure; exit 0/1. A connectivity
 * smoke test, not a query. Same registration as the scaffolded db.ts: the
 * root barrel registers six dialects, sqlite needs its own explicit
 * import (its adapter is runtime-specific and deliberately excluded from
 * the barrel — see norm's mod.ts) — so this works for whichever dialect
 * Norm.yaml actually names, not just the one it was scaffolded with.
 * @module
 */
import '@tundralibs/norm/engines/sqlite';
import { type DatabaseConfig, Norm } from '@tundralibs/norm';
import { loadConfig } from '@tundralibs/utils';

/** The `ping` command. Returns the process exit code. */
export async function pingCommand(dir = '.'): Promise<number> {
  const configDir = `${dir}/configs`;
  let database: DatabaseConfig;
  try {
    const config = await loadConfig({ path: configDir, env: true });
    database = config.get('norm.NORM_DB');
  } catch (error) {
    console.error(
      `✗ could not read ${configDir}/Norm.yaml — ${
        error instanceof Error ? error.message : error
      }`,
    );
    return 1;
  }

  // `new Norm` validates the config synchronously (e.g. a missing
  // required field throws right here, before any socket is touched) —
  // it must be inside the same try as connect().
  let norm: Norm | undefined;
  try {
    norm = new Norm({ database });
    await norm.connect();
    console.log(`✓ connected (${database.dialect})`);
    return 0;
  } catch (error) {
    console.error(
      `✗ ${database.dialect} — ${
        error instanceof Error ? error.message : error
      }`,
    );
    return 1;
  } finally {
    await norm?.disconnect().catch(() => {});
  }
}
