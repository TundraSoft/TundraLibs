export const enum DataTypes {
  // Integer
  'INT' = 'INT',
  'INTEGER' = 'INTEGER',
  'SMALLINT' = 'SMALLINT',
  'TINYINT' = 'TINYINT',
  'BIGINT' = 'BIGINT',
  'BIT' = 'BIT',
  'REAL' = 'REAL',
  'FLOAT' = 'FLOAT',
  'DOUBLE PRECISION' = 'DOUBLE PRECISION',
  'DOUBLE' = 'DOUBLE',
  'NUMERIC' = 'NUMERIC',
  'NUMBER' = 'NUMBER',
  'DECIMAL' = 'DECIMAL',
  'MONEY' = 'MONEY',
  // Boolean
  'BOOLEAN' = 'BOOLEAN',
  'BINARY' = 'BINARY',
  // String
  'CHAR' = 'CHAR',
  'CHARACTER' = 'CHARACTER',
  'VARCHAR' = 'VARCHAR',
  'NVARCHAR' = 'NVARCHAR',
  'NCHAR' = 'NCHAR',
  'CHARACTER VARYING' = 'CHARACTER VARYING',
  'TEXT' = 'TEXT',
  // Date & Time
  'DATE' = 'DATE',
  'DATE_Z' = 'DATE_Z',
  'TIME' = 'TIME',
  'TIME_Z' = 'TIME_Z',
  'DATETIME' = 'DATETIME',
  'DATETIME_Z' = 'DATETIME_Z',
  'TIMESTAMP' = 'TIMESTAMP',
  'TIMESTAMP_Z' = 'TIMESTAMP_Z',
  // Special
  'BLOB' = 'BLOB',
  'UUID' = 'UUID',
  'JSON' = 'JSON',
  'ARRAY' = 'ARRAY',
  'ARRAY_STRING' = 'ARRAY_STRING',
  'ARRAY_INTEGER' = 'ARRAY_INTEGER',
  'ARRAY_BIGINT' = 'ARRAY_BIGINT',
  'ARRAY_DECIMAL' = 'ARRAY_DECIMAL',
  'ARRAY_BOOLEAN' = 'ARRAY_BOOLEAN',
  'ARRAY_DATE' = 'ARRAY_DATE',
  'ARRAY_DATE_Z' = 'ARRAY_DATE_Z',
  'AUTO_INCREMENT' = 'AUTO_INCREMENT',
  'SERIAL' = 'SERIAL',
  'SMALLSERIAL' = 'SMALLSERIAL',
  'BIGSERIAL' = 'BIGSERIAL',
}

export type DataType = keyof typeof DataTypes;

export type NumberDataType =
  | 'INT'
  | 'INTEGER'
  | 'SMALLINT'
  | 'TINYINT'
  | 'BIGINT'
  | 'REAL'
  | 'FLOAT'
  | 'DOUBLE PRECISION'
  | 'DOUBLE'
  | 'NUMERIC'
  | 'NUMBER'
  | 'DECIMAL'
  | 'MONEY';
export type StringDataType =
  | 'CHAR'
  | 'CHARACTER'
  | 'VARCHAR'
  | 'NVARCHAR'
  | 'NCHAR'
  | 'CHARACTER VARYING'
  | 'TEXT'
  | 'BLOB';
export type BooleanDataType = 'BIT' | 'BOOLEAN' | 'BINARY';
export type DateDataType =
  | 'DATE'
  | 'DATE_Z'
  | 'TIME'
  | 'TIME_Z'
  | 'DATETIME'
  | 'DATETIME_Z'
  | 'TIMESTAMP'
  | 'TIMESTAMP_Z';
export type JSONDataType = 'JSON';
export type SerialDataType =
  | 'AUTO_INCREMENT'
  | 'SERIAL'
  | 'SMALLSERIAL'
  | 'BIGSERIAL';
export type SpecialDataType =
  | 'UUID'
  | 'ARRAY'
  | 'ARRAY_STRING'
  | 'ARRAY_INTEGER'
  | 'ARRAY_BIGINT'
  | 'ARRAY_DECIMAL'
  | 'ARRAY_BOOLEAN'
  | 'ARRAY_DATE'
  | 'ARRAY_DATE_Z';

export const DataTypeMap = {
  // Integer
  'INT': () => 1,
  'INTEGER': () => 1,
  'SMALLINT': () => 1,
  'TINYINT': () => 1,
  'BIGINT': () => 1n,
  'REAL': () => 1,
  'FLOAT': () => 1,
  'DOUBLE PRECISION': () => 1,
  'DOUBLE': () => 1,
  'NUMERIC': () => 1,
  'NUMBER': () => 1,
  'DECIMAL': () => 1,
  'MONEY': () => 1,
  // Boolean
  'BIT': () => true,
  'BOOLEAN': () => true,
  'BINARY': () => true,
  // String
  'CHAR': () => 'a',
  'CHARACTER': () => 'a',
  'VARCHAR': () => 'a',
  'NVARCHAR': () => 'a',
  'NCHAR': () => 'a',
  'CHARACTER VARYING': () => 'a',
  'TEXT': () => 'a',
  // Date & Time
  'DATE': () => new Date(),
  'DATE_Z': () => new Date(),
  'TIME': () => new Date(),
  'TIME_Z': () => new Date(),
  'DATETIME': () => new Date(),
  'DATETIME_Z': () => new Date(),
  'TIMESTAMP': () => new Date(),
  'TIMESTAMP_Z': () => new Date(),
  // Special
  'BLOB': () => 'a',
  'UUID': () => 'a',
  'JSON': () => {},
  'ARRAY': () => [],
  'ARRAY_STRING': () => [],
  'ARRAY_INTEGER': () => [],
  'ARRAY_BIGINT': () => [],
  'ARRAY_DECIMAL': () => [],
  'ARRAY_BOOLEAN': () => [],
  'ARRAY_DATE': () => [],
  'ARRAY_DATE_Z': () => [],
  'AUTO_INCREMENT': () => 1,
  'SERIAL': () => 1,
  'SMALLSERIAL': () => 1,
  'BIGSERIAL': () => 1n,
};
