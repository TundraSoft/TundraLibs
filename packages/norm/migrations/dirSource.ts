/**
 * @module
 *
 * The directory {@link MigrationSource} — `NNNN.json` snapshots and
 * `NNNN.<dialect>.sql` plans in one folder. The only migration code that
 * touches the filesystem, so a Migrator built from another source never
 * reaches `@tundralibs/compat/file`.
 *
 * @since 1.12.0
 */

import {
  ensureDir,
  pathExists,
  readDir,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';
import type { MigrationSnapshot } from './snapshot.ts';
import { planFilename } from './plans.ts';
import { formatVersionFilename, parseVersion } from './version.ts';
import type { WritableMigrationSource } from './source.ts';

/**
 * A writable source over a migrations directory. `new Migrator(db, { dir })`
 * builds one; pass it as `source` to share it.
 */
export function dirSource(dir: string): WritableMigrationSource {
  // Trailing slashes are trimmed by scanning back from the end rather than
  // with `/\/+$/`: that pattern re-tries from every position and re-scans the
  // run each time, so a path of many slashes costs O(n^2). This is O(n) with
  // a single allocation.
  let end = dir.length;
  while (end > 0 && dir[end - 1] === '/') end--;
  const root = dir.slice(0, end);
  const snapshotPath = (v: number): string =>
    `${root}/${formatVersionFilename(v)}`;
  const planPath = (v: number, dialect: Parameters<typeof planFilename>[1]) =>
    `${root}/${planFilename(v, dialect)}`;
  return {
    location: root,
    async versions() {
      if (!(await pathExists(root))) return [];
      const versions: number[] = [];
      for await (const entry of readDir(root)) {
        const v = parseVersion(entry.name);
        if (v !== null) versions.push(v);
      }
      return versions.sort((a, b) => a - b);
    },
    async snapshot(version) {
      return JSON.parse(
        await readTextFile(snapshotPath(version)),
      ) as MigrationSnapshot;
    },
    async plan(version, dialect) {
      try {
        return await readTextFile(planPath(version, dialect));
      } catch {
        return undefined; // plans are opt-in; none stored = no review gate
      }
    },
    snapshotPath,
    async writeSnapshot(version, snapshot) {
      await ensureDir(root);
      await writeTextFile(
        snapshotPath(version),
        JSON.stringify(snapshot, null, 2),
      );
    },
    planPath,
    async writePlan(version, dialect, text) {
      await writeTextFile(planPath(version, dialect), text);
    },
  };
}
