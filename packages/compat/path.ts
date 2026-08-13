/**
 * @fileoverview Cross-runtime `node:path`-compatible API. On Deno
 * this delegates to `@std/path`; on Node/Bun to `node:path`. Each
 * helper is a pass-through with the same semantics as the underlying
 * implementation, so see the Node docs for behaviour details.
 *
 * @module
 */

import * as stdPath from '@std/path';
import { isBun, isDeno, isNode, OS } from './runtime.ts';
import { loadBuiltin } from './_runtime-globals.ts';

/** PATH-variable separator: `;` on Windows, `:` elsewhere. */
export const DELIMITER: ';' | ':' = OS === 'WINDOWS' ? `;` : `:`;

/** Path component separator: `\` on Windows, `/` elsewhere. */
export const SEPARATOR: '\\' | '/' = OS === 'WINDOWS' ? `\\` : `/`;

/** Regex matching one-or-more path separators (Windows: `/` or `\`; else `/`). */
export const SEPARATOR_PATTERN = OS === 'WINDOWS' ? /[\\/]+/ : /\/+/;

/**
 * The slice of the `node:path` / `@std/path` surface this module
 * re-exports. Internal to this file — the exported helpers below are the
 * public contract.
 */
type NativePath = {
  basename(path: string, suffix?: string): string;
  dirname(path: string): string;
  extname(path: string): string;
  join(...paths: string[]): string;
  normalize(path: string): string;
  resolve(...paths: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  parse(path: string): {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  };
  format(pathObject: {
    root?: string;
    dir?: string;
    base?: string;
    ext?: string;
    name?: string;
  }): string;
};

// `@std/path` is pure JS, so a static import is bundler-safe; `node:path`
// comes through `process.getBuiltinModule` (see {@link loadBuiltin}).
// Neither may be a top-level `await import()` — one TLA anywhere in a
// module graph makes esbuild/Rollup lower every initializer in that graph
// to an async function, which deadlocks legal circular imports downstream.
let nativePath: NativePath;
if (isDeno) {
  nativePath = stdPath as NativePath;
} else if (isBun || isNode) {
  nativePath = loadBuiltin('node:path');
}

export const basename = (path: string, suffix?: string): string =>
  nativePath.basename(path, suffix);

export const dirname = (path: string): string => nativePath.dirname(path);

export const extname = (path: string): string => nativePath.extname(path);

export const join = (...paths: string[]): string => nativePath.join(...paths);

export const normalize = (path: string): string => nativePath.normalize(path);

export const resolve = (...paths: string[]): string =>
  nativePath.resolve(...paths);

export const relative = (from: string, to: string): string =>
  nativePath.relative(from, to);

export const isAbsolute = (path: string): boolean =>
  nativePath.isAbsolute(path);

export const parse = (path: string): {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
} => nativePath.parse(path);

export const format = (pathObject: {
  root?: string;
  dir?: string;
  base?: string;
  ext?: string;
  name?: string;
}): string => nativePath.format(pathObject);
