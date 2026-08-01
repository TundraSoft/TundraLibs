/**
 * @fileoverview {@link DialectUnsupportedError} — raised when a
 * translator is asked to emit a feature the dialect doesn't have
 * (e.g. SQLite + `CREATE_SCHEMA`, or SQLite + a materialised view).
 *
 * @module
 */

import { OqlError } from './Base.ts';

/**
 * Thrown when a dialect doesn't support a requested operation.
 * The abstract base raises this from the dispatch layer (e.g.
 * SQLite + `CREATE_SCHEMA`); concretes raise it from their own
 * builders (e.g. SQLite + `CREATE_VIEW { materialized: true }`).
 */
export class DialectUnsupportedError extends OqlError {
  public readonly dialect: string;
  public readonly feature: string;

  constructor(dialect: string, feature: string, cause?: Error) {
    super(
      `Dialect '${dialect}' does not support ${feature}`,
      { code: 'DIALECT_UNSUPPORTED', dialect, feature },
      cause,
    );
    this.dialect = dialect;
    this.feature = feature;
  }
}
