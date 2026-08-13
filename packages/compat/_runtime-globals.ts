/**
 * Loose typed accessors for runtime globals — the `Bun` object and the
 * `process.getBuiltinModule` hook used to load Node built-ins.
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

/**
 * Synchronously resolve a Node built-in (`node:fs`, `node:os`, …) through
 * `process.getBuiltinModule` — present on Deno 2, Node ≥ 22.3 and
 * Bun ≥ 1.1.31, which is the whole matrix compat supports.
 *
 * Built-ins are loaded this way instead of with `await import()` at module
 * scope because a single top-level await anywhere in a module graph makes
 * esbuild (wrangler) and Rollup (Vite) lower *every* module initializer in
 * that graph to an async function. Circular imports that are perfectly legal
 * ESM — and work natively — then deadlock, so consumers bundling compat for
 * workerd or the browser hang forever on import.
 *
 * The optional chaining returns `undefined` on runtimes with no such hook
 * (browsers, workerd). Callers keep their existing guards, so a missing
 * backend still yields the documented fallback or an
 * `UnsupportedRuntimeError` at call time — never at import time.
 *
 * Returns `any` so each call site can annotate itself with the module's
 * `typeof import('node:x')` shape without repeating the type; the binding
 * being possibly-`undefined` off a supported runtime is exactly why every
 * caller keeps a runtime guard.
 */
export const loadBuiltin = (id: string): any =>
  (globalThis as any).process?.getBuiltinModule?.(id);
