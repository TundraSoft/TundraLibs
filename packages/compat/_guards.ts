/**
 * @fileoverview Internal guard for Node built-ins loaded via
 * {@link loadBuiltin}. A runtime that looks Node-like (`isNode` /
 * `isBun`) can still be missing a specific built-in — Cloudflare
 * Workers under `nodejs_compat` exposes `process.versions.node` yet
 * returns `undefined` for `node:http`, `node:fs`, `node:net`, … — so a
 * branch that dereferences the loaded module would throw a bare
 * `TypeError`. {@link assertBuiltin} turns that into an explicit
 * {@link UnsupportedRuntimeError} at the head of the branch, before any
 * dereference.
 *
 * Not re-exported from the package root — internal to compat.
 *
 * @module
 */

import { UnsupportedRuntimeError } from './Error.ts';
import { RUNTIME } from './runtime.ts';

/**
 * Assert that a Node built-in loaded for the current runtime is
 * actually present. Call it once at the top of a Node-path branch —
 * `assertBuiltin(nodeHttp, 'node:http', 'WebServer.start')` — so a
 * missing built-in surfaces as a clear {@link UnsupportedRuntimeError}
 * naming the operation and the runtime, not a `TypeError` on
 * `undefined`.
 *
 * @param builtin - The value returned by {@link loadBuiltin}.
 * @param id - The built-in's specifier, e.g. `'node:fs'`.
 * @param operation - The public operation the caller is serving.
 *
 * @throws {@link UnsupportedRuntimeError} When `builtin` is
 *   `undefined` or `null`.
 */
export function assertBuiltin(
  builtin: unknown,
  id: string,
  operation: string,
): void {
  if (builtin === undefined || builtin === null) {
    throw new UnsupportedRuntimeError(
      operation,
      RUNTIME,
      `${id} is unavailable in this runtime`,
    );
  }
}
