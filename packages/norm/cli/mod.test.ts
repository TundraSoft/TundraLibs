/**
 * @fileoverview Tests for {@link run} — the CLI's arg-parsing dispatcher.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import { run } from './mod.ts';

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await makeTempDir({ prefix: 'norm-cli-dispatch-' });
  try {
    await fn(dir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
};

describe('norm.cli dispatcher', () => {
  it('prints help and exits 0 for a bare/help invocation', async () => {
    asserts.assertEquals(await run({ _: [] }), 0);
    asserts.assertEquals(await run({ _: ['help'] }), 0);
  });

  it('exits 1 for an unknown command', async () => {
    asserts.assertEquals(await run({ _: ['nope'] }), 1);
  });

  it('dispatches upgrade and ping to their commands', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(await run({ _: ['upgrade'], dir }), 0);
      asserts.assertEquals(await run({ _: ['ping', dir] }), 1);
    });
  });
});
