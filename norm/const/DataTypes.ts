import { array, type } from '../../guardian/mod.ts';

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

export const DataTypeMap = {
  // Integer
  'INT': type('number'),
  'INTEGER': type('number'),
  'SMALLINT': type('number'),
  'TINYINT': type('number'),
  'BIGINT': type('bigint'),
  'REAL': type('number'),
  'FLOAT': type('number'),
  'DOUBLE PRECISION': type('number'),
  'DOUBLE': type('number'),
  'NUMERIC': type('number'),
  'NUMBER': type('number'),
  'DECIMAL': type('number'),
  'MONEY': type('number'),
  // Boolean
  'BIT': type('boolean'),
  'BOOLEAN': type('boolean'),
  'BINARY': type('boolean'),
  // String
  'CHAR': type('string'),
  'CHARACTER': type('string'),
  'VARCHAR': type('string'),
  'NVARCHAR': type('string'),
  'NCHAR': type('string'),
  'CHARACTER VARYING': type('string'),
  'TEXT': type('string'),
  // Date & Time
  'DATE': type('date'),
  'DATE_Z': type('date'),
  'TIME': type('date'),
  'TIME_Z': type('date'),
  'DATETIME': type('date'),
  'DATETIME_Z': type('date'),
  'TIMESTAMP': type('date'),
  'TIMESTAMP_Z': type('date'),
  // Special
  'BLOB': type('string'),
  'UUID': type('string'),
  'JSON': type('object'),
  'ARRAY': array(),
  'ARRAY_STRING': array(),
  'ARRAY_INTEGER': array(),
  'ARRAY_BIGINT': array(),
  'ARRAY_DECIMAL': array(),
  'ARRAY_BOOLEAN': array(),
  'ARRAY_DATE': array(),
  'ARRAY_DATE_Z': array(),
  'AUTO_INCREMENT': type('number'),
  'SERIAL': type('number'),
  'SMALLSERIAL': type('number'),
  'BIGSERIAL': type('bigint'),
};