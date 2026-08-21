/**
 * @fileoverview Hrana `PipelineRespBody` — the JSON body of a pipeline reply.
 *
 * @module
 */

import type { HranaStreamResult } from './HranaStreamResult.ts';

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
