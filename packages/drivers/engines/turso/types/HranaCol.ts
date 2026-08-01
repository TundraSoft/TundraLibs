/**
 * @fileoverview Hrana `Col` — a result-set column descriptor.
 *
 * @module
 */

/**
 * A single column descriptor from a Hrana statement result.
 *
 * Both fields are nullable on the wire: `name` is the column's name or alias
 * (null for an unnamed expression), and `decltype` is the column's declared
 * SQLite type (e.g. `'INTEGER'`, `'TEXT'`), null when SQLite reports none.
 * The engine uses these — together with each row cell's `HranaValue` tag — to
 * decode values; this client passes them through unchanged.
 *
 * Confirmed against the Hrana v3 spec's `Col` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaCol = {
  /** Column name/alias, or `null` for an unnamed result column. */
  name: string | null;

  /** Declared SQLite column type, or `null` when none is declared. */
  decltype: string | null;
};
