/**
 * @fileoverview A tiny cross-runtime `git init` for the scaffolder — no
 * compat subprocess helper exists, so branch on the runtime. Best-effort:
 * returns `false` (never throws) when git is missing or unsupported.
 * @module
 */
import { isBun, isDeno, isNode } from '@tundralibs/compat/runtime';

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

/** Run `git init` in `dir`. Returns whether it succeeded. */
export async function gitInit(dir: string): Promise<boolean> {
  try {
    if (isDeno) {
      const { success } = await new g.Deno.Command('git', {
        args: ['init'],
        cwd: dir,
        stdout: 'null',
        stderr: 'null',
      }).output();
      return success === true;
    }
    if (isBun || isNode) {
      const cp = g.process?.getBuiltinModule?.('node:child_process');
      if (!cp) return false;
      cp.execSync('git init', { cwd: dir, stdio: 'ignore' });
      return true;
    }
  } catch {
    // git not installed / not a supported runtime.
  }
  return false;
}
