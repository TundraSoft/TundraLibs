/**
 * @fileoverview Hrana `StreamResult` — the outcome of one pipeline step.
 *
 * @module
 */

import type { HranaError } from './HranaError.ts';
import type { HranaStreamResponse } from './HranaStreamResponse.ts';

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
