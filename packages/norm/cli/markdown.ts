/**
 * @fileoverview Merge norm's guide into an existing `CLAUDE.md`/`AGENTS.md`
 * (many projects already have one — including this monorepo's own root),
 * or write a fresh one when neither exists. A delimited block makes the
 * merge idempotent AND refreshable: rerunning `init` never appends a
 * second copy, and `upgrade` can replace stale generated content in place
 * without touching anything a user wrote outside the block.
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

/** Matches the ENTIRE delimited block (markers included), across lines. */
const BLOCK = new RegExp(String.raw`${START}[\s\S]*?${END}\n?`);

/**
 * Write `path` with `body` (wrapped) if it doesn't exist yet; if the
 * delimited block is already there, REPLACE it with the current `body`
 * (a no-op when unchanged) so `upgrade` can keep it fresh; otherwise
 * append a fresh wrapped section. Content outside the block is never
 * touched, in every branch.
 *
 * @returns `'created'`, `'updated'`, `'appended'`, or `'unchanged'`.
 */
export async function ensureSection(
  path: string,
  body: string,
): Promise<'created' | 'updated' | 'appended' | 'unchanged'> {
  const section = wrap(body);
  if (!(await pathExists(path))) {
    await writeTextFile(path, section);
    return 'created';
  }

  const existing = await readTextFile(path);
  const match = BLOCK.exec(existing);
  if (match !== null) {
    if (match[0] === section) return 'unchanged';
    await writeTextFile(path, existing.replace(BLOCK, section));
    return 'updated';
  }

  const sep = existing.endsWith('\n\n')
    ? ''
    : existing.endsWith('\n')
    ? '\n'
    : '\n\n';
  await writeTextFile(path, `${existing}${sep}${section}`);
  return 'appended';
}
