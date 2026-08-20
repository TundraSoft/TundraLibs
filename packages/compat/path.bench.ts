/**
 * @fileoverview Benchmarks for the path helpers — and the pilot file
 * for the cross-runtime bench harness (`./bench`): the same file runs
 * unmodified under `deno run`, `bun run`, and `node --import tsx`, and
 * `scripts/bench-all.ts` merges the three runs into one table.
 *
 * @module
 */

import { bench } from './bench.ts';
import { basename, extname, join, normalize, resolve } from './path.ts';

const DEEP = 'packages/compat/webserver/types/RequestInfo.ts';
const MESSY = 'packages//compat/./webserver/../webserver/mod.ts';

bench('path.join - two segments', () => {
  return join('packages', 'compat');
});

bench('path.join - five segments', () => {
  return join('packages', 'compat', 'webserver', 'types', 'RequestInfo.ts');
});

bench(
  'path.normalize - already clean',
  { group: 'normalize', baseline: true },
  () => {
    return normalize(DEEP);
  },
);

bench('path.normalize - messy (./ and ../)', { group: 'normalize' }, () => {
  return normalize(MESSY);
});

bench('path.resolve - relative deep path', () => {
  return resolve(DEEP);
});

bench('path.basename + extname', () => {
  return basename(DEEP) + extname(DEEP);
});
