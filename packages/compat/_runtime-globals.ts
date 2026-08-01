/**
 * Loose typed accessor for the Bun runtime globals.
 *
 * `@tundralibs/compat` references `Bun.serve` / `Bun.file` / etc. inside
 * `if (isBun)` branches, but neither Deno's nor Node's lib types know about
 * `Bun`. We can't type it with `declare global` (JSR forbids it —
 * "modifying global types is not allowed") nor with
 * `/// <reference types="@types/bun" />` (that would force every consumer to
 * install `@types/bun`). Instead we read the global off `globalThis` and type it
 * loosely here; files that need it do `import { Bun } from './_runtime-globals.ts'`.
 *
 * `Deno.*` is typed via the workspace's `compilerOptions.lib` (`deno.ns`), not
 * here. The signatures below are intentionally `any`-loose: these calls only run
 * on Bun (guarded by `isBun`), so Deno/Node static analysis never executes them.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any

/** Minimal, loose surface of the `Bun` global that compat actually calls. */
type BunGlobal = {
  serve(opts: any): any;
  listen(opts: any): any;
  file(path: string): any;
  udpSocket(opts: any): Promise<any>;
};

/**
 * The `Bun` global (or `undefined` off Bun). Only dereferenced inside
 * `if (isBun)` branches, so it is never accessed on Deno or Node.
 */
export const Bun: BunGlobal = (globalThis as any).Bun;
