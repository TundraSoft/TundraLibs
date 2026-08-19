/**
 * @fileoverview `requestId` — correlation-id PROPAGATION sugar. The
 * POLICY lives in the core (adopt/validate/mint via
 * `server.requestIdHeader`, echoed on every HTTP response including
 * 404s — no middleware required for that); this middleware EXTENDS the
 * reach: extra header names, a `ctx.state` copy, and echoing the id
 * into socket response envelopes (the bare frame protocol doesn't
 * carry it).
 *
 * @module
 */

import type { RapidMiddleware } from '../types/mod.ts';

/** Options for {@link requestId}. */
export type RequestIdOptions = {
  /**
   * ADDITIONAL HTTP response headers to stamp with the id (the
   * configured `server.requestIdHeader` is always stamped by the core
   * regardless), e.g. `['x-correlation-id']`.
   */
  headers?: string[];
  /** Copy the id into `ctx.state[stateKey]` on every transport. */
  stateKey?: string;
  /**
   * On SOCKET frames whose response content is a plain object, add a
   * `requestId` key to it (existing keys are never overwritten).
   * @default false
   */
  socketEcho?: boolean;
};

/** Build the propagation middleware. */
export function requestId(options: RequestIdOptions = {}): RapidMiddleware {
  return async (ctx, next) => {
    if (options.stateKey !== undefined) {
      (ctx.state as Record<string, unknown>)[options.stateKey] = ctx.requestId;
    }
    if (ctx.type === 'HTTP') {
      for (const header of options.headers ?? []) {
        ctx.setHeader(header, ctx.requestId);
      }
    }
    await next();
    if (options.socketEcho === true && ctx.type === 'SOCKET') {
      const response = ctx.response;
      const content = response?.content;
      if (
        response !== null && typeof content === 'object' &&
        content !== null && !(content instanceof Uint8Array) &&
        // An ARRAY is typeof 'object' and has no 'requestId' key, so it
        // would pass every other test and get spread into an object —
        // `[1,2,3]` becoming `{0:1,1:2,2:3,requestId}`. There is nowhere
        // to put the id in an array reply, so leave it untouched.
        !Array.isArray(content) &&
        !('requestId' in content)
      ) {
        // Body-only override — the context contract preserves the
        // already-set status.
        ctx.response = {
          content: { ...content, requestId: ctx.requestId },
        };
      }
    }
  };
}
