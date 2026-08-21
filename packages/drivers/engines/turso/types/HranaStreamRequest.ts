/**
 * @fileoverview Hrana `StreamRequest` — a single request within a pipeline.
 *
 * @module
 */

import type { HranaStmt } from './HranaStmt.ts';

/**
 * A single request within a Hrana pipeline.
 *
 * {@link TursoHttpClient.execute} sends exactly two: an `execute` carrying the
 * statement, followed by a `close` that tears the implicit stream down in the
 * same round-trip (so no `baton` needs to be reused). The spec defines further
 * variants (`batch`, `sequence`, `describe`, prepared-statement management)
 * that this single-shot transport does not use.
 *
 * Confirmed against the Hrana v3 spec's `StreamRequest` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaStreamRequest =
  | { type: 'execute'; stmt: HranaStmt }
  | { type: 'close' };
