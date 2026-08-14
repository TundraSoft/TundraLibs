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
  /** The refusing dialect, as reported by the translator's `Dialect`. */
  public readonly dialect: string;

  /** The refused feature, verbatim as it appears in the message. */
  public readonly feature: string;

  /**
   * Both arguments land on the instance and in `meta` under
   * `DIALECT_UNSUPPORTED`.
   *
   * @param feature - Reads as the object of "does not support …", so pass a
   *   noun phrase (`'FULL JOIN'`, `"filter operator '$ilike'"`). Parenthesised
   *   guidance is conventional here — see the Mongo `COUNT with 'distinct'`
   *   throw site.
   */
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
