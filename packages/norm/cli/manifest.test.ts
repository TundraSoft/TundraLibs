/**
 * @fileoverview Tests for {@link ensureManifest} — the deno.json/
 * package.json merge helper `init` and `upgrade` share.
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
import { ensureManifest } from './manifest.ts';

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await makeTempDir({ prefix: 'norm-cli-manifest-' });
  try {
    await fn(dir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
};

describe('norm.cli manifest merge', () => {
  const spec = {
    depsKey: 'imports' as const,
    deps: { '@tundralibs/norm': 'jsr:@tundralibs/norm@^1' },
    tasksKey: 'tasks' as const,
    tasks: { test: 'deno test -A' },
  };

  it('writes the skeleton when the manifest does not exist', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      const status = await ensureManifest(path, '{"name":"skeleton"}', spec);
      asserts.assertEquals(status, 'created');
      asserts.assertEquals(
        JSON.parse(await readTextFile(path)),
        { name: 'skeleton' },
      );
    });
  });

  it('adds only the missing deps/tasks, leaving unrelated keys untouched', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      await writeTextFile(
        path,
        JSON.stringify(
          { name: 'existing', imports: { other: 'jsr:@x/other@^2' } },
          null,
          2,
        ),
      );
      const status = await ensureManifest(path, 'unused', spec);
      asserts.assertEquals(status, 'merged');
      const manifest = JSON.parse(await readTextFile(path));
      asserts.assertEquals(manifest.name, 'existing');
      asserts.assertEquals(manifest.imports.other, 'jsr:@x/other@^2');
      asserts.assertEquals(
        manifest.imports['@tundralibs/norm'],
        'jsr:@tundralibs/norm@^1',
      );
      asserts.assertEquals(manifest.tasks.test, 'deno test -A');
    });
  });

  it('leaves the file untouched when every dep/task is already present', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      const original = JSON.stringify({
        name: 'existing',
        imports: { '@tundralibs/norm': 'jsr:@tundralibs/norm@^9.9.9' },
        tasks: { test: 'a custom test command' },
      });
      await writeTextFile(path, original);
      const status = await ensureManifest(path, 'unused', spec);
      asserts.assertEquals(status, 'unchanged');
      // Never rewrites an existing value, even one that differs from `spec`.
      asserts.assertEquals(await readTextFile(path), original);
    });
  });
});
