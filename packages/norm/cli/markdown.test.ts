/**
 * @fileoverview Tests for {@link ensureSection} — the marker-delimited
 * merge helper `init`/`upgrade` use to keep `norm.agent.md`'s pointer
 * fresh in `AGENTS.md`/`CLAUDE.md` without disturbing a project's own notes.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeTempDir,
  readTextFile,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { ensureSection } from './markdown.ts';

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await makeTempDir({ prefix: 'norm-cli-markdown-' });
  try {
    await fn(dir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
};

describe('norm.cli markdown merge', () => {
  it('writes a fresh wrapped section when the file does not exist', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/CLAUDE.md`;
      const status = await ensureSection(path, 'norm guide');
      asserts.assertEquals(status, 'created');
      const content = await readTextFile(path);
      asserts.assertStringIncludes(content, '<!-- norm:start -->');
      asserts.assertStringIncludes(content, 'norm guide');
      asserts.assertStringIncludes(content, '<!-- norm:end -->');
    });
  });

  it('appends the section to existing content without disturbing it', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/CLAUDE.md`;
      await writeTextFile(path, '# My project\n\nHand-written notes.\n');
      const status = await ensureSection(path, 'norm guide');
      asserts.assertEquals(status, 'appended');
      const content = await readTextFile(path);
      asserts.assertStringIncludes(content, 'Hand-written notes.');
      asserts.assertStringIncludes(content, '<!-- norm:start -->');
    });
  });

  it('does not append a second copy on rerun', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/CLAUDE.md`;
      await ensureSection(path, 'norm guide');
      const status = await ensureSection(path, 'norm guide');
      asserts.assertEquals(status, 'unchanged');
      const content = await readTextFile(path);
      asserts.assertEquals(
        content.split('<!-- norm:start -->').length - 1,
        1,
      );
    });
  });

  it('replaces the block in place when the body changes, leaving surrounding content alone', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/AGENTS.md`;
      await writeTextFile(path, '# My project\n\nHand-written notes.\n');
      await ensureSection(path, 'old norm guide');

      const status = await ensureSection(path, 'new norm guide');
      asserts.assertEquals(status, 'updated');
      const content = await readTextFile(path);
      asserts.assertStringIncludes(content, 'Hand-written notes.');
      asserts.assertStringIncludes(content, 'new norm guide');
      asserts.assertEquals(content.includes('old norm guide'), false);
      // Still exactly one delimited block.
      asserts.assertEquals(
        content.split('<!-- norm:start -->').length - 1,
        1,
      );
    });
  });
});
