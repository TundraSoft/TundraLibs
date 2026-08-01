/**
 * @fileoverview Hrana `PipelineRespBody` — the JSON body of a pipeline reply.
 *
 * @module
 */

import type { HranaError } from './HranaError.ts';
import type { HranaStmtResult } from './HranaStmtResult.ts';

/**
 * The response to one pipeline step.
 *
 * Only the variants this client sends requests for are modelled: `execute`
 * (carrying the statement's {@link HranaStmtResult}) and `close`.
 *
 * Confirmed against the Hrana v3 spec's `StreamResponse` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaStreamResponse =
  | { type: 'execute'; result: HranaStmtResult }
  | { type: 'close' };

/**
 * The outcome of one pipeline step: either `ok` (with the step's response) or
 * `error` (with a per-statement {@link HranaError}). A statement error is
 * reported here **inside a 200 response** — it does not fail the HTTP request.
 *
 * Confirmed against the Hrana v3 spec's `StreamResult` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaStreamResult =
  | { type: 'ok'; response: HranaStreamResponse }
  | { type: 'error'; error: HranaError };

/**
 * The JSON body returned from `<baseURL>/v3/pipeline`.
 *
 * `results` is positionally aligned with the request's `requests`. `baton`
 * (when non-null) and `base_url` support stream resumption / redirection,
 * which this single-shot client ignores.
 *
 * Confirmed against the Hrana v3 spec's `PipelineRespBody` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type TursoPipelineResponse = {
  /** Stream-resumption token for a follow-up request, or `null`. */
  baton: string | null;

  /** Base URL to direct follow-up requests at, or `null`. */
  base_url: string | null;

  /** Per-step outcomes, aligned with the request's `requests`. */
  results: HranaStreamResult[];
};
