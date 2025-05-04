/**
 * String data types supported by the database system
 * These are for character-based data like names, descriptions, and text
 */
export const StringDataTypes = {
  'BINARY': 'BINARY',
  'BLOB': 'BLOB',
  'CHAR': 'CHAR',
  'VARCHAR': 'VARCHAR',
  'TEXT': 'TEXT',
};

/**
 * Boolean data types supported by the database system
 * These represent true/false values
 */
export const BooleanDataTypes = {
  'BIT': 'BIT',
  'BOOL': 'BOOL',
  'BOOLEAN': 'BOOLEAN',
};

/**
 * Date and time data types supported by the database system
 * These represent points in time, dates, and time intervals
 */
export const DateDataTypes = {
  'DATE': 'DATE',
  'TIME': 'TIME',
  'DATETIME': 'DATETIME',
  'TIMESTAMP': 'TIMESTAMP',
  'TIMESTAMPTZ': 'TIMESTAMPTZ',
};

/**
 * JSON data types supported by the database system
 * These represent structured data in JSON format
 */
export const JSONDataTypes = {
  'JSON': 'JSON',
  'JSONB': 'JSONB',
};

/**
 * Serial data types supported by the database system
 * These are typically used for auto-incrementing primary keys
 */
export const SerialDataTypes = {
  'SERIAL': 'SERIAL',
  'BIGSERIAL': 'BIGSERIAL',
  'AUTO_INCREMENT': 'AUTO_INCREMENT',
};

/**
 * Big integer data types supported by the database system
 * These represent large integer values
 */
export const BigIntDataTypes = {
  'BIGINT': 'BIGINT',
  'BIGSERIAL': 'BIGSERIAL',
  'AUTO_INCREMENT': 'AUTO_INCREMENT',
};

/**
 * Integer data types supported by the database system
 * These represent whole number values of various sizes
 */
export const IntegerDataTypes = {
  'INTEGER': 'INTEGER',
  'SMALLINT': 'SMALLINT',
  'MEDIUMINT': 'MEDIUMINT',
  'TINYINT': 'TINYINT',
  'SERIAL': 'SERIAL',
};

/**
 * Decimal and floating point data types supported by the database system
 * These represent numbers with fractional parts
 */
export const DecimalDataTypes = {
  'NUMERIC': 'NUMERIC',
  'DECIMAL': 'DECIMAL',
  'FLOAT': 'FLOAT',
  'DOUBLE': 'DOUBLE',
  'REAL': 'REAL',
};

/**
 * UUID/GUID data types supported by the database system
 * These represent globally unique identifiers
 */
export const UUIDDataTypes = {
  'UUID': 'UUID',
  'GUID': 'GUID',
};

/**
 * Combined collection of all data types supported by the database system
 */
export const DataTypes = {
  ...StringDataTypes,
  ...BooleanDataTypes,
  ...DateDataTypes,
  ...JSONDataTypes,
  ...BigIntDataTypes,
  ...IntegerDataTypes,
  ...DecimalDataTypes,
  ...UUIDDataTypes,
} as const;

/**
 * Union type of all available data types
 */
export type DataType = keyof typeof DataTypes;

/**
 * String data type string literal union
 */
export type StringDataType = keyof typeof StringDataTypes;

/**
 * Boolean data type string literal union
 */
export type BooleanDataType = keyof typeof BooleanDataTypes;

/**
 * Date data type string literal union
 */
export type DateDataType = keyof typeof DateDataTypes;

/**
 * JSON data type string literal union
 */
export type JSONDataType = keyof typeof JSONDataTypes;

/**
 * Serial data type string literal union
 */
export type SerialDataType = keyof typeof SerialDataTypes;

/**
 * Big integer data type string literal union
 */
export type BigIntDataType = keyof typeof BigIntDataTypes;

/**
 * Integer data type string literal union
 */
export type IntegerDataType = keyof typeof IntegerDataTypes;

/**
 * Decimal data type string literal union
 */
export type DecimalDataType = keyof typeof DecimalDataTypes;

/**
 * UUID data type string literal union
 */
export type UUIDDataType = keyof typeof UUIDDataTypes;
