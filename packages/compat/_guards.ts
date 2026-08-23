/**
 * @fileoverview Internal guard for Node built-ins loaded via
 * {@link loadBuiltin}. A runtime can be missing the specific built-in a
 * branch needs — a browser has no `process.getBuiltinModule` at all, and
 * which modules Cloudflare Workers resolves depends on the
 * `nodejs_compat` flag and compatibility date — so a branch that
 * dereferences the loaded module would throw a bare `TypeError`.
 * {@link assertBuiltin} turns that into an explicit
 * {@link UnsupportedRuntimeError} at the head of the branch, before any
 * dereference.
 *
 * Resolving is not the same as working: workerd returns a `node:dgram`
 * whose `bind()` never calls back, which is why `udp.ts` rejects on
 * `isWorkers` rather than trusting the guard alone.
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
