/**
 * @fileoverview Resolve the latest published version of a JSR package —
 * used by `init` (to pin the new project's dep) and `upgrade`.
 * @module
 */

/** Latest version of `@tundralibs/<pkg>` from JSR, or `null` on failure. */
export async function latestVersion(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://jsr.io/@tundralibs/${pkg}/meta.json`);
    if (!res.ok) return null;
    const meta = await res.json() as { latest?: string };
    return meta.latest ?? null;
  } catch {
    return null;
  }
}
