/**
 * @fileoverview Write/refresh the project's norm AI-guide docs — shared by
 * `init` (first write) and `upgrade` (refresh only what norm generated).
 * `norm.agent.md` is fully generated: overwritten wholesale every time,
 * never merged. `AGENTS.md`/`CLAUDE.md` only ever get a short, delimited
 * pointer to it, so anything a user writes elsewhere in those files
 * survives every future `upgrade`.
 * @module
 */
import { writeTextFile } from '@tundralibs/compat/file';
import { ensureSection } from './markdown.ts';
import { AI_GUIDE_LINK, AI_GUIDE_SECTION } from './templates.ts';

/** Write `norm.agent.md` and ensure the `AGENTS.md`/`CLAUDE.md` pointer to
 * it — called by both `init` and `upgrade`, so scaffolding a project and
 * upgrading one produce identical, idempotent results. */
export async function ensureAgentDocs(base: string): Promise<void> {
  await writeTextFile(`${base}/norm.agent.md`, AI_GUIDE_SECTION);
  await ensureSection(`${base}/AGENTS.md`, AI_GUIDE_LINK);
  await ensureSection(`${base}/CLAUDE.md`, AI_GUIDE_LINK);
}
