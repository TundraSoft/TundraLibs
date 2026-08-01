/**
 * @fileoverview Column descriptor returned in a Neon SQL-over-HTTP response.
 *
 * @module
 */

/**
 * A single column descriptor from the `fields` array of a Neon SQL-over-HTTP
 * success response. Mirrors node-postgres' `FieldDef`: `name` and
 * `dataTypeID` are always present, the rest are Postgres `RowDescription`
 * metadata that may be absent.
 *
 * The `dataTypeID` is the Postgres type OID — PR4's engine uses it (together
 * with the raw text value) to decode each cell via the Postgres `decodeValue`
 * path, which is why this client requests raw-text output and performs no
 * coercion itself.
 */
export type NeonField = {
  /** Column name (or its alias). */
  name: string;

  /** Postgres type OID (`pg_type.oid`) for the column. */
  dataTypeID: number;

  /** OID of the source table, or `0` when not a plain column. */
  tableID?: number;

  /** Attribute number of the column within its table, or `0`. */
  columnID?: number;

  /** Type size in bytes (negative for variable-length types). */
  dataTypeSize?: number;

  /** Type modifier (type-specific; `-1` when none). */
  dataTypeModifier?: number;

  /** Wire format (`'text'` or `'binary'`). */
  format?: string;
};
