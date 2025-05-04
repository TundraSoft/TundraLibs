import type {
  DataType,
  DecimalDataType,
  StringDataType,
} from '../../const/DataTypes.ts';
/**
 * ColumnDefinition describes the structure of a database column definition.
 *
 * This type is generic over the column's DataType, and conditionally adds
 * additional properties based on the type:
 * - For string types, a `length` property is available.
 * - For decimal types, `precision` and `scale` properties are available.
 *
 * This ensures that only relevant properties are allowed for each column type,
 * improving type safety and developer experience.
 *
 * @template T - The database column type (must extend DataType)
 * @property name - (optional) The name of the column
 * @property type - The column's data type
 * @property nullable - (optional) Whether the column allows null values
 * @property comment - (optional) A comment describing the column
 * @property length - (optional, only for string types) The maximum length of the string
 * @property precision - (optional, only for decimal types) The total number of significant digits
 * @property scale - (optional, only for decimal types) The number of digits after the decimal point
 */
export type ColumnDefinition<T extends DataType = DataType> =
  & {
    name?: string; // Column name
    type: T; // Column type
    nullable?: boolean; // Nullable flag
    comment?: string; // Column comment
  }
  & (T extends StringDataType ? {
      length?: number; // Length for string types
    }
    : T extends DecimalDataType ? {
        precision?: number; // Precision for decimal types
        scale?: number; // Scale for decimal types
      }
    : never) extends infer O ? {
    [Property in keyof O]: O[Property];
  }
  : never;
