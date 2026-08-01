/**
 * Column value-type primitives. Includes `null` so callers can model
 * nullable columns directly without an extra union per usage.
 */
export type ColumnTypes =
  | string
  | number
  | bigint
  | Date
  | boolean
  | Record<string, unknown>
  | null;
