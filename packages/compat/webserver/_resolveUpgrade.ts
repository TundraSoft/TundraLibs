/**
 * @fileoverview Shared resolution of a {@link WebSocketHandler.upgrade}
 * hook into a decision the upgrade sites can act on.
 *
 * Two callers, one contract: {@link WebServer}'s Bun / Deno / Node
 * branches, which fall through to the HTTP handler when the hook
 * refuses, and `websocket`'s request-driven `handleUpgrade`, which has
 * no HTTP handler to fall through to and answers with a status instead.
 * They differ in what they do with a refusal, never in how the decision
 * is read — keeping that in one place is what stops the two paths from
 * drifting apart on defaults or on the `UpgradeDecision` shape.
 *
 * Internal to compat; not re-exported from any barrel.
 *
 * @module
 */

import type { UpgradeDecision, WebSocketUpgradeContext } from './types/mod.ts';

/**
 * Outcome of {@link resolveUpgrade}: either the hook refused, or it
 * accepted and produced the per-connection data, subprotocol, extra
 * response headers, and the context handed to the `open` callback.
 *
 * @typeParam T - Per-connection data type.
 */
export type ResolvedUpgrade<T> =
  | { accepted: false }
  | {
    accepted: true;
    userData: T;
    protocol: string;
    extraHeaders: HeadersInit | undefined;
    upgradeContext: WebSocketUpgradeContext;
  };

/**
 * Run `upgrade` (when supplied) and normalise its
 * {@link UpgradeDecision} — omitted hook means accept, `false` means
 * refuse, an object customizes.
 *
 * @param request - The HTTP upgrade request.
 * @param upgrade - The user's hook, or `undefined` to accept by default.
 * @param remoteAddress - Peer address, or `null` when unavailable.
 * @param remotePort - Peer port, or `null` when unavailable.
 *
 * @internal
 */
export async function resolveUpgrade<T>(
  request: Request,
  upgrade:
    | ((
      request: Request,
      info: { remoteAddress: string | null; remotePort: number | null },
    ) => UpgradeDecision<T> | Promise<UpgradeDecision<T>>)
    | undefined,
  remoteAddress: string | null,
  remotePort: number | null,
): Promise<ResolvedUpgrade<T>> {
  // Snapshot to a fresh Request: on Bun, `server.upgrade()`
  // invalidates the original request's `url` after upgrade — the
  // open handler then sees `ctx.request.url === ''`. Headers and
  // method survive, but URL doesn't. Capturing into a new Request
  // here gives users a stable object across runtimes.
  const snapshotRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
  });
  const upgradeContext: WebSocketUpgradeContext = {
    request: snapshotRequest,
    remoteAddress,
    remotePort,
  };
  const decision: UpgradeDecision<T> = upgrade
    ? await upgrade(request, { remoteAddress, remotePort })
    : true;
  if (decision === false) return { accepted: false };
  const isObj = typeof decision === 'object' && decision !== null;
  return {
    accepted: true,
    userData: isObj ? decision.data : (upgradeContext as unknown as T),
    protocol: isObj ? (decision.protocol ?? '') : '',
    extraHeaders: isObj ? decision.headers : undefined,
    upgradeContext,
  };
}
