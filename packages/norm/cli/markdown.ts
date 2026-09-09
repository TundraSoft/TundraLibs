/**
 * @fileoverview Merge norm's guide into an existing `CLAUDE.md`/`AGENTS.md`
 * (many projects already have one — including this monorepo's own root),
 * or write a fresh one when neither exists. A delimited block makes the
 * merge idempotent: rerunning `init` never appends a second copy.
 * @module
 */
import {
  pathExists,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';

const START = '<!-- norm:start -->';
const END = '<!-- norm:end -->';

/**
 * Wrap `body` in the delimiters `ensureSection` looks for on rerun. Blank
 * lines around the HTML comments so `deno fmt`'s markdown formatter (block
 * content needs blank-line separation from an adjacent comment) accepts a
 * freshly generated file as already formatted.
 */
const wrap = (body: string): string => `${START}\n\n${body.trim()}\n\n${END}\n`;

/**
 * Write `path` with `body` (wrapped) if it doesn't exist yet; otherwise
 * append the wrapped section unless it's already present.
 *
 * @returns `'created'`, `'appended'`, or `'unchanged'` (block already there).
 */
export async function ensureSection(
  path: string,
  body: string,
): Promise<'created' | 'appended' | 'unchanged'> {
  const section = wrap(body);
  if (!(await pathExists(path))) {
    await writeTextFile(path, section);
    return 'created';
  }

  const existing = await readTextFile(path);
  if (existing.includes(START)) return 'unchanged';

  const sep = existing.endsWith('\n\n')
    ? ''
    : existing.endsWith('\n')
    ? '\n'
    : '\n\n';
  await writeTextFile(path, `${existing}${sep}${section}`);
  return 'appended';
}
