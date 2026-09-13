/**
 * @fileoverview Tests for {@link initCommand} — the `init` scaffold end
 * to end, against real temp directories (no mocking @tundralibs/compat/file).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeDir,
  makeTempDir,
  pathExists,
  readTextFile,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { initCommand } from './init.ts';

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await makeTempDir({ prefix: 'norm-cli-init-' });
  try {
    await fn(dir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
};

// A stub resolver — no live network I/O, so the suite stays deterministic
// and fast, and never depends on jsr.io being reachable from CI.
const fakeResolver = (): Promise<string | null> => Promise.resolve('9.9.9');

describe('norm.cli init', () => {
  it('scaffolds a fresh project: models, dialect-agnostic db.ts/config, both manifests, AI guides', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(
        await initCommand({ _: [], yes: true }, dir, fakeResolver),
        0,
      );

      asserts.assert(await pathExists(`${dir}/models/Users.ts`));
      asserts.assert(await pathExists(`${dir}/models/mod.ts`));

      const normYaml = await readTextFile(`${dir}/configs/Norm.yaml`);
      asserts.assertStringIncludes(normYaml, 'dialect: sqlite');
      asserts.assertStringIncludes(normYaml, 'NORM_DB:');

      const db = await readTextFile(`${dir}/db.ts`);
      asserts.assertStringIncludes(db, 'loadConfig({ path: configDir');
      asserts.assertStringIncludes(db, "config.get('norm.NORM_DB')");
      // db.ts is dialect-agnostic — never mentions a specific dialect.
      asserts.assert(!db.includes('postgres'));

      const denoJson = JSON.parse(await readTextFile(`${dir}/deno.json`));
      asserts.assertEquals(denoJson.name, 'my-norm-project');
      asserts.assert('@tundralibs/norm' in denoJson.imports);
      asserts.assertEquals(denoJson.tasks.check, 'deno check db.ts');

      const packageJson = JSON.parse(
        await readTextFile(`${dir}/package.json`),
      );
      asserts.assert('@tundralibs/norm' in packageJson.dependencies);
      asserts.assertEquals(
        packageJson.scripts.test,
        'node --import tsx --test',
      );

      // AGENTS.md/CLAUDE.md carry only the short pointer — the full guide
      // lives in its own file, so a user's later edits to these two never
      // get clobbered by a future `upgrade`.
      const claude = await readTextFile(`${dir}/CLAUDE.md`);
      asserts.assertStringIncludes(claude, '<!-- norm:start -->');
      asserts.assertStringIncludes(claude, 'norm.agent.md');
      asserts.assertEquals(claude.includes('## Schema'), false);

      const agents = await readTextFile(`${dir}/AGENTS.md`);
      asserts.assertStringIncludes(agents, '<!-- norm:start -->');
      asserts.assertStringIncludes(agents, 'norm.agent.md');
      asserts.assertEquals(agents.includes('## Schema'), false);

      const guide = await readTextFile(`${dir}/norm.agent.md`);
      asserts.assertStringIncludes(guide, '# norm');
      asserts.assertStringIncludes(guide, '## Schema');
    });
  });

  it('never overwrites an existing configs/Norm.yaml', async () => {
    await withTempDir(async (dir) => {
      await makeDir(`${dir}/configs`, { recursive: true });
      const customYaml = 'NORM_DB:\n  dialect: postgres\n  host: prod-db\n';
      await writeTextFile(`${dir}/configs/Norm.yaml`, customYaml);

      await initCommand({ _: [], yes: true }, dir, fakeResolver);

      asserts.assertEquals(
        await readTextFile(`${dir}/configs/Norm.yaml`),
        customYaml,
      );
    });
  });

  it('never overwrites an existing db.ts or models file', async () => {
    await withTempDir(async (dir) => {
      await writeTextFile(`${dir}/db.ts`, '// hand-wired connection\n');
      await makeDir(`${dir}/models`, { recursive: true });
      await writeTextFile(
        `${dir}/models/Users.ts`,
        '// hand-written entity\n',
      );

      await initCommand({ _: [], yes: true }, dir, fakeResolver);

      asserts.assertEquals(
        await readTextFile(`${dir}/db.ts`),
        '// hand-wired connection\n',
      );
      asserts.assertEquals(
        await readTextFile(`${dir}/models/Users.ts`),
        '// hand-written entity\n',
      );
    });
  });

  it('picks up the project name from an existing manifest instead of prompting', async () => {
    await withTempDir(async (dir) => {
      await writeTextFile(
        `${dir}/package.json`,
        JSON.stringify({ name: 'acme-schema', dependencies: {} }, null, 2),
      );

      await initCommand({ _: [], yes: true }, dir, fakeResolver);

      const packageJson = JSON.parse(
        await readTextFile(`${dir}/package.json`),
      );
      asserts.assertEquals(packageJson.name, 'acme-schema');
      asserts.assertEquals(packageJson.dependencies.tsx, '^4');
      // deno.json didn't exist yet — still gets created, with the SAME name.
      const denoJson = JSON.parse(await readTextFile(`${dir}/deno.json`));
      asserts.assertEquals(denoJson.name, 'acme-schema');
    });
  });

  it('is idempotent — a second run adds nothing further', async () => {
    await withTempDir(async (dir) => {
      await initCommand({ _: [], yes: true }, dir, fakeResolver);
      const before = await readTextFile(`${dir}/CLAUDE.md`);
      const guideBefore = await readTextFile(`${dir}/norm.agent.md`);

      await initCommand({ _: [], yes: true }, dir, fakeResolver);

      asserts.assertEquals(await readTextFile(`${dir}/CLAUDE.md`), before);
      asserts.assertEquals(
        await readTextFile(`${dir}/norm.agent.md`),
        guideBefore,
      );
    });
  });
});
