/**
 * @fileoverview `socketOutcome` — turn a finalized SOCKET outcome into
 * the rpc error envelope, decoupled from the transport for testing.
 *
 * Two failures are possible in an error outcome, and they need
 * different handling. A FRAMEWORK failure arrives as the disclosure
 * payload (`{ code, message }`) built by `RapidError.payload()`; its
 * code and message are exactly what the client should see. A
 * HANDLER-AUTHORED failure (`ctx.response = { status: 422, content: {
 * fields } }`) carries neither — historically it was laundered into
 * `RAPID_UNHANDLED` / "Internal server error" with the body DISCARDED,
 * so the same handler returned rich detail over HTTP and nothing over
 * a socket. Here the code is derived from the STATUS and the content
 * rides `error.data`, so both transports say the same thing.
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';
import { RAPID_ERROR_CODES, type RapidErrorCode } from '../errors/mod.ts';

/** Status → framework code, for outcomes that carry no code of their own. */
const STATUS_CODES: ReadonlyMap<number, RapidErrorCode> = new Map(
  (Object.entries(RAPID_ERROR_CODES) as [RapidErrorCode, { status: number }][])
    // First registration wins: the table is ordered with the generic
    // codes first, so 500 resolves to RAPID_UNHANDLED rather than a
    // later, more specific 500-mapped code.
    .reduce((acc, [code, spec]) => {
      if (!acc.some(([status]) => status === spec.status)) {
        acc.push([spec.status, code]);
      }
      return acc;
    }, [] as [number, RapidErrorCode][]),
);

/** The rpc error envelope a failed socket command throws. */
export type SocketErrorEnvelope = {
  code: string;
  message: string;
  /** Structured detail — the handler's own content, when it had any. */
  data?: unknown;
};

/**
 * Derive the error envelope for a `status >= 400` socket outcome.
 *
 * @param status - The interpreted outcome status.
 * @param content - The outcome content: a disclosure payload for
 *   framework failures, anything the handler set otherwise.
 */
export function socketOutcome(
  status: StatusCode,
  content: unknown,
): SocketErrorEnvelope {
  const disclosure = typeof content === 'object' && content !== null &&
      !Array.isArray(content)
    ? content as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      debug?: unknown;
      requestId?: unknown;
    }
    : {};
  // Only a REGISTERED framework code marks this as a disclosure payload (the
  // {code,message,details?,requestId} shape). A handler-authored error body
  // that merely happens to carry a `code` (e.g. a REST `{code:'CONFLICT',
  // current}`) is NOT a disclosure — it must fall through to the handler
  // branch below so ALL its keys ride `data`, not just details/debug/reqId.
  const hasCode = typeof disclosure.code === 'string' &&
    disclosure.code in RAPID_ERROR_CODES;
  const code = hasCode ? disclosure.code as string : STATUS_CODES.get(status) ??
    // No exact mapping (a 409, a 422 — statuses the framework has no
    // code for). Fall back by CLASS rather than to RAPID_UNHANDLED:
    // the rpc error frame has no status field, so the code is the
    // client's only signal of WHO failed, and calling a client error
    // "Internal server error" is the laundering this function exists
    // to stop.
    (status >= 400 && status < 500
      ? 'RAPID_VALIDATION_FAILED'
      : 'RAPID_UNHANDLED');
  const message = typeof disclosure.message === 'string'
    ? disclosure.message
    : RAPID_ERROR_CODES[code as RapidErrorCode]?.message ??
      'Internal server error';
  if (hasCode) {
    // A framework disclosure payload is {code, message} PLUS whichever
    // of details/debug/requestId RapidError.payload()/Transport._invoke
    // actually attached (details rides on every 4xx, requestId on
    // every framework failure — see errors/Base.ts and
    // transports/Transport.ts). Dropping them here was the same class
    // of cross-transport data loss M2 fixed for handler-authored
    // content — HTTP gets the full body, SOCKET got {code,message}.
    const extra: Record<string, unknown> = {};
    if (disclosure.details !== undefined) extra.details = disclosure.details;
    if (disclosure.debug !== undefined) extra.debug = disclosure.debug;
    if (disclosure.requestId !== undefined) {
      extra.requestId = disclosure.requestId;
    }
    return {
      code,
      message,
      ...(Object.keys(extra).length > 0 ? { data: extra } : {}),
    };
  }
  return {
    code,
    message,
    // Handler-authored content is the whole point of `data`.
    ...(content === null || content === undefined ? {} : { data: content }),
  };
}
