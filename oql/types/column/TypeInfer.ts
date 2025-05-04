import type {
  BigIntDataType,
  BooleanDataType,
  DataType,
  DateDataType,
  DecimalDataType,
  IntegerDataType,
  JSONDataType,
  StringDataType,
  UUIDDataType,
} from '../../const/DataTypes.ts';
/**
 * Type inference utility that maps database column types to their
 * corresponding TypeScript types.
 *
 * This mapping ensures type safety when working with database values in TypeScript.
 * It translates SQL data types into appropriate TypeScript types.
 *
 * @template T - The database column type to infer the TypeScript type for
 * @returns The corresponding TypeScript type for the given database column type
 *
 * @example
 * ```typescript
 * // This will be of type 'number'
 * type IdType = ColumnTypeInfer<'INTEGER'>;
 *
 * // This will be of type 'string'
 * type NameType = ColumnTypeInfer<'VARCHAR'>;
 *
 * // This will be of type 'Record<string, unknown>'
 * type DataType = ColumnTypeInfer<'JSON'>;
 * ```
 */
export type ColumnTypeInfer<T extends DataType> = T extends BooleanDataType
  ? boolean
  : T extends DateDataType ? Date
  : T extends JSONDataType ? Record<string, unknown>
  : T extends BigIntDataType ? bigint
  : T extends DecimalDataType ? number
  : T extends IntegerDataType ? number
  : T extends UUIDDataType ? string
  : T extends StringDataType ? string
  : never;
