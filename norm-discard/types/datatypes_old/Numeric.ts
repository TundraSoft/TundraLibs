// Identifier for Serial
export type SerialDataType =
  | 'SERIAL'
  | 'SMALLSERIAL'
  | 'BIGSERIAL'
  | 'AUTO_INCRIMENT';

// Identifier for BigInt
export type BigIntDataType = 'BIGINT' | 'BIGSERIAL';

// Identifier for Integer
export type IntegerDataType =
  | 'INT'
  | 'INTEGER'
  | 'SMALLINT'
  | 'TINYINT'
  | 'MEDIUMINT';

export type DecimalDataType =
  | 'REAL'
  | 'FLOAT'
  | 'DOUBLE PRECISION'
  | 'DOUBLE'
  | 'NUMERIC'
  | 'NUMBER'
  | 'DECIMAL'
  | 'MONEY';

// All numeric data types
export type NumericDataType =
  | IntegerDataType
  | DecimalDataType;
