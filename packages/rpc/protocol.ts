/**
 * @fileoverview Wire-protocol codec for `@tundralibs/rpc`.
 *
 * Frames are JSON envelopes — see {@link "./types/mod.ts"} for the full
 * shape. Encoding is just `JSON.stringify`; decoding is shape-validated
 * to reject malformed payloads at the boundary so handlers don't have
 * to defend against arbitrary input.
 *
 * @module
 */

import type { InboundFrame, OutboundFrame } from './types/mod.ts';

/**
 * Serialize an outbound frame to a JSON string ready for `ws.send()`.
 */
export const encodeFrame = (frame: OutboundFrame): string =>
  JSON.stringify(frame);

/**
 * Parse and validate an inbound frame. Returns the typed frame on
 * success or `null` on any malformed input — invalid JSON, missing
 * required fields, unknown `type`, etc. The caller is responsible for
 * sending an `error` frame back to the client when this returns null.
 *
 * Validation is intentionally minimal — it confirms the envelope shape
 * but does not validate command payloads (that's the validator's job).
 */
export const decodeFrame = (raw: string): InboundFrame | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null;
  if (typeof obj.type !== 'string') return null;

  switch (obj.type) {
    case 'cmd':
      if (typeof obj.cmd !== 'string' || obj.cmd.length === 0) return null;
      return {
        id: obj.id,
        type: 'cmd',
        cmd: obj.cmd,
        payload: obj.payload,
      };

    case 'sub':
    case 'unsub':
      if (typeof obj.channel !== 'string' || obj.channel.length === 0) {
        return null;
      }
      return {
        id: obj.id,
        type: obj.type,
        channel: obj.channel,
      };

    case 'pub':
      if (typeof obj.channel !== 'string' || obj.channel.length === 0) {
        return null;
      }
      if (!('payload' in obj)) return null;
      return {
        id: obj.id,
        type: 'pub',
        channel: obj.channel,
        payload: obj.payload,
      };

    default:
      return null;
  }
};

/**
 * Best-effort recovery of a frame's `id` from raw wire text that failed
 * {@link decodeFrame}.
 *
 * A frame can be rejected by `decodeFrame` (unknown `type`, missing
 * `cmd` / `channel` / `payload`, …) while still carrying a perfectly
 * good `id` — the offending request *is* correlatable. When the server
 * builds an out-of-band `error` frame it uses this to pull that `id`
 * back out, so the client can reject the correlated pending request and
 * fail fast instead of hanging until its request timeout.
 *
 * Returns `undefined` when the text isn't JSON, isn't an object, or has
 * no usable `id` — applying the exact same `id` rule `decodeFrame`
 * enforces (a non-empty string), so a recovered id is always one a
 * client could legitimately have sent.
 */
export const recoverFrameId = (raw: string): string | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const id = (parsed as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
};
