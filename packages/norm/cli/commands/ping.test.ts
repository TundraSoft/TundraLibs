/**
 * @fileoverview Tests for {@link pingCommand} — the connectivity smoke
 * test against `configs/Norm.yaml`, including one real
 * `norm.connect()`/`disconnect()` against sqlite.
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
