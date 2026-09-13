/**
 * @fileoverview Tests for {@link upgradeCommand} — dependency version
 * bumps and the `.agent.md`/`AGENTS.md`/`CLAUDE.md` refresh, against real
 * temp directories (no mocking @tundralibs/compat/file).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeTempDir,
  pathExists,
  readTextFile,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { upgradeCommand } from './upgrade.ts';

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await makeTempDir({ prefix: 'norm-cli-upgrade-' });
  try {
    await fn(dir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
};

// A stub resolver — no live network I/O, so the suite stays deterministic
// and fast, and never depends on jsr.io being reachable from CI.
const fakeResolver = (): Promise<string | null> => Promise.resolve('9.9.9');

describe('norm.cli upgrade', () => {
  it('bumps a deno.json @tundralibs/* version to the latest release', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      await writeTextFile(
        path,
        JSON.stringify({
          imports: { '@tundralibs/norm': 'jsr:@tundralibs/norm@^0.0.1' },
        }),
      );
      asserts.assertEquals(await upgradeCommand(dir, fakeResolver), 0);
      const after = await readTextFile(path);
      asserts.assertStringIncludes(after, '@^9.9.9');
    });
  });

  it('bumps a package.json npm-style @tundralibs/* version too', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/package.json`;
      await writeTextFile(
        path,
        JSON.stringify({
          dependencies: {
            '@tundralibs/utils': 'npm:@jsr/tundralibs__utils@^0.0.1',
          },
        }),
      );
      asserts.assertEquals(await upgradeCommand(dir, fakeResolver), 0);
      asserts.assertStringIncludes(
        await readTextFile(path),
        '@^9.9.9',
      );
    });
  });

  it('reports success with nothing to change when neither manifest exists', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(await upgradeCommand(dir), 0);
    });
  });

  it('writes norm.agent.md and the AGENTS.md/CLAUDE.md pointer on a project that never had them', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(await upgradeCommand(dir), 0);
      asserts.assertStringIncludes(
        await readTextFile(`${dir}/norm.agent.md`),
        '# norm',
      );
      asserts.assertStringIncludes(
        await readTextFile(`${dir}/AGENTS.md`),
        'norm.agent.md',
      );
    });
  });

  it('migrates a project scaffolded before this feature: the old embedded guide is replaced with the link, and the rest of AGENTS.md survives', async () => {
    await withTempDir(async (dir) => {
      // The OLD shape: the full guide sat directly between the markers.
      await writeTextFile(
        `${dir}/AGENTS.md`,
        '# My project\n\nOur own house rules go here.\n\n' +
          '<!-- norm:start -->\n\n## norm\n\n### Schema\n\nold stale guide text\n\n<!-- norm:end -->\n',
      );

      asserts.assertEquals(await upgradeCommand(dir), 0);

      const agents = await readTextFile(`${dir}/AGENTS.md`);
      asserts.assertStringIncludes(agents, 'Our own house rules go here.');
      asserts.assertStringIncludes(agents, 'norm.agent.md');
      asserts.assertEquals(agents.includes('old stale guide text'), false);
      asserts.assert(await pathExists(`${dir}/norm.agent.md`));
    });
  });

  it('running upgrade twice in a row is idempotent (unchanged, not appended)', async () => {
    await withTempDir(async (dir) => {
      await upgradeCommand(dir);
      const guideBefore = await readTextFile(`${dir}/norm.agent.md`);
      const agentsBefore = await readTextFile(`${dir}/AGENTS.md`);

      await upgradeCommand(dir);

      asserts.assertEquals(
        await readTextFile(`${dir}/norm.agent.md`),
        guideBefore,
      );
      asserts.assertEquals(
        await readTextFile(`${dir}/AGENTS.md`),
        agentsBefore,
      );
    });
  });
});
