/**
 * @fileoverview Hrana `StreamResponse` — the response to one pipeline step.
 *
 * @module
 */

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
