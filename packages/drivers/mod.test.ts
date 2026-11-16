/**
 * @fileoverview Package-wide invariants of the drivers source.
 *
 * Guards that no source file carries a regex lookbehind. Safari before 16.4
 * cannot parse one, and a pattern it cannot parse stops the whole module from
 * loading there.
 *
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { readDirSync, readTextFileSync } from '@tundralibs/compat/file';
import { join } from '@tundralibs/compat/path';

/** Package root: this file sits at `packages/drivers/mod.test.ts`. */
const PACKAGE_DIR = import.meta.dirname!;

/**
 * `(?<=` or `(?<!`, wherever it is written: `placeholders.ts` builds its
 * patterns from strings, so a regex literal is not the only place to look.
 */
const LOOKBEHIND = /\(\?<[=!]/;

/** Every `.ts` file under `dir` that is not a test, dependencies left out. */
const sourceFiles = (dir: string, found: string[] = []): string[] => {
  for (const entry of readDirSync(dir)) {
    if (entry.isDirectory) {
      if (entry.name !== 'node_modules') {
        sourceFiles(join(dir, entry.name), found);
      }
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
};

describe('drivers.source', () => {
  it('should carry no regex lookbehind', () => {
    const files = sourceFiles(PACKAGE_DIR);
    const names = files.map((file) => file.slice(PACKAGE_DIR.length + 1));
    asserts.assert(
      names.includes('placeholders.ts') &&
        names.includes(join('engines', 'postgres', 'Engine.ts')),
      'the walk must reach the package sources',
    );

    const offenders: string[] = [];
    files.forEach((file, at) => {
      readTextFileSync(file).split('\n').forEach((line, index) => {
        if (LOOKBEHIND.test(line)) offenders.push(`${names[at]}:${index + 1}`);
      });
    });
    asserts.assertEquals(
      offenders,
      [],
      `lookbehind found, Safari before 16.4 cannot load the file: ${
        offenders.join(', ')
      }`,
    );
  });
});
