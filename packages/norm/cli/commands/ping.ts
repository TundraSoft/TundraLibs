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
// Relative, not '@tundralibs/norm' — this file lives INSIDE the norm
// package. A bare self-specifier resolves fine in dev/test (the
// workspace's own import map maps it locally) but breaks `deno publish`'s
// module-graph check, which cannot resolve a package through its own
// not-yet-published JSR version.
import '../../engines/sqlite.ts';
import { type DatabaseConfig, Norm } from '../../mod.ts';
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
