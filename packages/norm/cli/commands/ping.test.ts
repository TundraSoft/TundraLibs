/**
 * @fileoverview Tests for {@link pingCommand} — the connectivity smoke
 * test against `configs/Norm.yaml`.
 *
 * This file is deliberately kept small and standalone: its one real
 * `norm.connect()`/`disconnect()` (via `node:sqlite` under Node) has been
 * observed to trigger a Node 22 `node:test` runner bug when a LOT of
 * further file I/O follows in the same test file — the test reporter's
 * IPC channel to the parent process ends up corrupted ("Unable to
 * deserialize cloned data due to invalid or unsupported version"),
 * failing the whole file. Deno and Bun are unaffected. Keeping this
 * suite in its own small file (Node's test runner isolates per file)
 * avoids the accumulated volume that triggers it, rather than chasing
 * the upstream bug.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeDir,
  makeTempDir,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { pingCommand } from './ping.ts';

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await makeTempDir({ prefix: 'norm-cli-ping-' });
  try {
    await fn(dir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
};

describe('norm.cli ping', () => {
  it('exits 1 with a clear message when configs/Norm.yaml is missing', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(await pingCommand(dir), 1);
    });
  });

  it('exits 1 without a real network attempt when required fields are missing', async () => {
    await withTempDir(async (dir) => {
      await makeDir(`${dir}/configs`, { recursive: true });
      // postgres requires host/username/database — none supplied, so this
      // must fail fast at validation, never dial a socket.
      await writeTextFile(
        `${dir}/configs/Norm.yaml`,
        'NORM_DB:\n  dialect: postgres\n',
      );
      asserts.assertEquals(await pingCommand(dir), 1);
    });
  });

  it('connects and disconnects cleanly for a valid sqlite config', async () => {
    await withTempDir(async (dir) => {
      await makeDir(`${dir}/configs`, { recursive: true });
      await writeTextFile(
        `${dir}/configs/Norm.yaml`,
        `NORM_DB:\n  dialect: sqlite\n  path: ${dir}/data\n`,
      );
      asserts.assertEquals(await pingCommand(dir), 0);
    });
  });
});
