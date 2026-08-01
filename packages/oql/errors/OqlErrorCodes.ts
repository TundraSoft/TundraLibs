/**
 * @fileoverview Stable error codes for `@tundralibs/oql`.
 *
 * Every {@link OqlError} carries a `code` from this union so callers can
 * branch on `err.code` instead of matching message text. Mirrors the
 * drivers-layer `EngineErrorCodes` pattern (a string-literal union plus a
 * `code` field on the error) but is kept deliberately lightweight: oql
 * builds each message inline rather than from a `${var}` template, so the
 * map below is a code → short-description lookup for docs/tooling, not a
 * message-construction table.
 *
 * @module
 */

/** Union of every stable {@link OqlError} code. */
export type OqlErrorCode =
  | 'UNKNOWN'
  | 'DIALECT_UNSUPPORTED'
  | 'INVALID_COLUMN_REF'
  | 'FILTER_DEPTH_EXCEEDED'
  | 'EXISTS_NO_OUTER_TABLE'
  | 'INSERT_COLUMN_NOT_IN_SCHEMA'
  | 'JOIN_NO_COLUMNS'
  | 'ALTER_VIEW_EMPTY'
  | 'INVALID_AGGREGATE_COLUMN'
  | 'UNHANDLED_EXPRESSION'
  | 'PARAM_INLINE_UNSUPPORTED'
  | 'NON_FINITE_LITERAL'
  | 'INVALID_TIME_UNIT';

/**
 * Code → short human description. Parity with the drivers
 * `EngineErrorCodes` map; used for docs/tooling that want a label for a
 * code, not for building the thrown message (oql passes a full message to
 * {@link OqlError} directly).
 */
export const OqlErrorCodes: Record<OqlErrorCode, string> = {
  /** Fallback when an error is constructed without an explicit code. */
  UNKNOWN: 'Unknown OQL error',
  /** The target dialect does not support the requested feature. */
  DIALECT_UNSUPPORTED: 'Dialect does not support the requested feature',
  /** A column reference did not start with the required `@` sigil. */
  INVALID_COLUMN_REF: 'Malformed column reference',
  /** A filter nested past the translator recursion limit. */
  FILTER_DEPTH_EXCEEDED: 'Filter recursion depth exceeded',
  /** An `$exists` correlation had no outer table to qualify against. */
  EXISTS_NO_OUTER_TABLE: 'EXISTS filter has no outer table context',
  /** INSERT/UPSERT data named a column not declared in the schema. */
  INSERT_COLUMN_NOT_IN_SCHEMA: 'INSERT column not declared in schema',
  /** A join alias auto-expansion had no columns to project. */
  JOIN_NO_COLUMNS: 'Join has no columns to auto-expand',
  /** ALTER_VIEW was given neither a `renameTo` nor a `query`. */
  ALTER_VIEW_EMPTY: 'ALTER_VIEW requires renameTo or query',
  /** An aggregate column was neither a column reference nor an expression. */
  INVALID_AGGREGATE_COLUMN:
    'Aggregate column must be a column ref or expression',
  /** An object-arg expression reached the flattener without a handler. */
  UNHANDLED_EXPRESSION: 'Unhandled object-arg expression',
  /** A non-`named` placeholder format was asked to inline its params. */
  PARAM_INLINE_UNSUPPORTED: 'Cannot inline this placeholder format',
  /** A non-finite number was asked to render as a SQL literal. */
  NON_FINITE_LITERAL: 'Cannot inline non-finite number literal',
  /** A date-arithmetic expression carried an unrecognised `unit`. */
  INVALID_TIME_UNIT: 'Unrecognised date-arithmetic time unit',
} as const satisfies Record<OqlErrorCode, string>;
