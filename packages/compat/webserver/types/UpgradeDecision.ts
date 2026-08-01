/**
 * Result of a `WebSocketHandler.upgrade` hook.
 *
 * - `false` — refuse the upgrade; falls through to the HTTP
 *   handler which can return any status.
 * - `true` — accept with defaults (the implicit decision when no
 *   `upgrade` hook is provided).
 * - object — accept and customize: `data` becomes `ws.data`,
 *   `protocol` selects from `Sec-WebSocket-Protocol`, `headers`
 *   merges into the `101` response.
 *
 * @typeParam T - Per-connection data type.
 */
export type UpgradeDecision<T = unknown> =
  | false
  | true
  | {
    data: T;
    protocol?: string;
    headers?: HeadersInit;
  };
