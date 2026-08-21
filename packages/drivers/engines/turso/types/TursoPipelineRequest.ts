/**
 * @fileoverview Hrana `PipelineReqBody` — the POST body of a pipeline request.
 *
 * @module
 */

import type { HranaStreamRequest } from './HranaStreamRequest.ts';

/**
 * The JSON body POSTed to `<baseURL>/v3/pipeline`.
 *
 * `baton` resumes an existing server-side stream; for a self-contained
 * `execute` + `close` round-trip there is nothing to resume, so this client
 * sends `null`. `requests` is the ordered list of pipeline steps.
 *
 * Confirmed against the Hrana v3 spec's `PipelineReqBody` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type TursoPipelineRequest = {
  /** Stream-resumption token; `null` for a self-contained round-trip. */
  baton: string | null;

  /** Ordered pipeline steps (this client sends `[execute, close]`). */
  requests: readonly HranaStreamRequest[];
};
