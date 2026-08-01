/**
 * @fileoverview Postgres error JSON returned by Neon on a failed query.
 *
 * @module
 */

/**
 * The JSON body Neon returns for a failed query (typically HTTP 400).
 *
 * It mirrors a Postgres `ErrorResponse`: `message` is always present, `code`
 * is the five-character SQLSTATE, and the remaining fields are the optional
 * diagnostic parts. {@link NeonHttpError} carries this object through so the
 * PR4 engine can translate `code` into an `EngineError` code.
 */
export type NeonPostgresError = {
  /** Primary human-readable error message (Postgres `M` field). */
  message: string;

  /** SQLSTATE code, e.g. `'23505'` (Postgres `C` field). */
  code?: string;

  /** Severity, e.g. `'ERROR'`, `'FATAL'`, `'PANIC'`. */
  severity?: string;

  /** Secondary detail message. */
  detail?: string;

  /** Optional suggestion for how to resolve the problem. */
  hint?: string;

  /** 1-based character position of the error in the original query. */
  position?: string;

  /** Position within an internally-generated query. */
  internalPosition?: string;

  /** Text of a failed internally-generated command. */
  internalQuery?: string;

  /** Context in which the error occurred (call stack traceback). */
  where?: string;

  /** Schema name, when the error is associated with a specific object. */
  schema?: string;

  /** Table name, when applicable. */
  table?: string;

  /** Column name, when applicable. */
  column?: string;

  /** Data type name, when applicable. */
  dataType?: string;

  /** Constraint name, when applicable. */
  constraint?: string;

  /** Source-code file reporting the error. */
  file?: string;

  /** Source-code line number reporting the error. */
  line?: string;

  /** Source-code routine reporting the error. */
  routine?: string;
};
