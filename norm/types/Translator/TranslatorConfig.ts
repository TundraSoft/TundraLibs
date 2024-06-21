import { DataTypes } from '../DataTypes.ts';
import type {
  GeneratorFunction,
  GeneratorOutput,
  Generators,
} from './Generators.ts';
import { Generator } from './Generators.ts';

export type TranslatorConfig = {
  quote: {
    column: '"' | "'" | '`';
    value: '"' | "'" | '`';
  };
  dataTypes: {
    [Property in keyof typeof DataTypes]: string;
  };
  generators: {
    [Property in Generators]: GeneratorOutput | GeneratorFunction;
  };
  // & { [key: string]: GeneratorOutput | GeneratorFunction };
};

export const PostgresTranslatorConfig: TranslatorConfig = {
  quote: {
    column: '"',
    value: "'",
  },
  dataTypes: {
    'INT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'SMALLINT': 'INTEGER',
    'TINYINT': 'INTEGER',
    'SERIAL': 'SERIAL',
    'SMALLSERIAL': 'SMALLSERIAL',
    'BIGSERIAL': 'BIGSERIAL',
    'BIGINT': 'BIGINT',
    'BIT': 'BOOLEAN',
    'BOOLEAN': 'BOOLEAN',
    'BINARY': 'BOOLEAN',
    'REAL': 'REAL',
    'FLOAT': 'DOUBLE PRECISION',
    'DOUBLE PRECISION': 'DOUBLE PRECISION',
    'DOUBLE': 'DOUBLE PRECISION',
    'NUMERIC': 'NUMERIC',
    'NUMBER': 'NUMERIC',
    'DECIMAL': 'DECIMAL',
    'MONEY': 'DECIMAL',
    'CHAR': 'CHARACTER',
    'CHARACTER': 'CHARACTER',
    'VARCHAR': 'VARCHAR',
    'NVARCHAR': 'VARCHAR',
    'NCHAR': 'CHARACTER',
    'CHARACTER VARYING': 'VARCHAR',
    'DATE': 'DATE',
    'TIME': 'TIME',
    'DATETIME': 'DATETIME',
    'TIMESTAMP': 'TIMESTAMPTZ',
    'BYTEA': 'BYTEA',
    'TEXT': 'TEXT',
    'UUID': 'UUID',
    'JSON': 'JSON',
    'ARRAY': 'VARCHAR[]',
    'ARRAY_STRING': 'VARCHAR[]',
    'ARRAY_INTEGER': 'INTEGER[]',
    'ARRAY_BIGINT': 'BIGINT[]',
    'ARRAY_DECIMAL': 'DECIMAL[]',
    'ARRAY_BOOLEAN': 'BOOLEAN[]',
    'ARRAY_DATE': 'DATE[]',
    'AUTO_INCREMENT': 'SERIAL',
  },
  generators: {
    [Generator.CURRENT_DATE]: '${CURRENT_DATE}',
    [Generator.CURRENT_TIME]: '${CURRENT_TIME}',
    [Generator.CURRENT_DATETIME]: '${CURRENT_DATETIME}',
    [Generator.CURRENT_TIMESTAMP]: '${CURRENT_TIMESTAMP}',
    [Generator.UUID]: '${GEN_RANDOM_UUID()}',
    [Generator.NOW]: '${NOW()}',
    [Generator.SYS_GUID]: "${REPLACE(GEN_RANDOM_UUID()::varchar, '-', '')}",
  },
};

export const MariaTranslatorConfig: TranslatorConfig = {
  quote: {
    column: '`',
    value: "'",
  },
  dataTypes: {
    'INT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'SMALLINT': 'INTEGER',
    'TINYINT': 'INTEGER',
    'SERIAL': 'AUTO_INCREMENT',
    'SMALLSERIAL': 'AUTO_INCREMENT',
    'BIGSERIAL': 'AUTO_INCREMENT',
    'BIGINT': 'BIGINT',
    'BIT': 'BOOLEAN',
    'BOOLEAN': 'BOOLEAN',
    'BINARY': 'BOOLEAN',
    'REAL': 'REAL',
    'FLOAT': 'DOUBLE',
    'DOUBLE PRECISION': 'DOUBLE',
    'DOUBLE': 'DOUBLE',
    'NUMERIC': 'NUMERIC',
    'NUMBER': 'NUMERIC',
    'DECIMAL': 'DECIMAL',
    'MONEY': 'DECIMAL',
    'CHAR': 'CHARACTER',
    'CHARACTER': 'CHARACTER',
    'VARCHAR': 'VARCHAR',
    'NVARCHAR': 'VARCHAR',
    'NCHAR': 'CHARACTER',
    'CHARACTER VARYING': 'VARCHAR',
    'DATE': 'DATE',
    'TIME': 'TIME',
    'DATETIME': 'DATETIME',
    'TIMESTAMP': 'TIMESTAMP',
    'BYTEA': 'TEXT',
    'TEXT': 'TEXT',
    'UUID': 'UUID',
    'JSON': 'JSON',
    'ARRAY': 'TEXT',
    'ARRAY_STRING': 'TEXT',
    'ARRAY_INTEGER': 'TEXT',
    'ARRAY_BIGINT': 'TEXT',
    'ARRAY_DECIMAL': 'TEXT',
    'ARRAY_BOOLEAN': 'TEXT',
    'ARRAY_DATE': 'TEXT',
    'AUTO_INCREMENT': 'AUTO_INCREMENT',
  },
  generators: {
    [Generator.CURRENT_DATE]: '${CURDATE()}',
    [Generator.CURRENT_TIME]: '${CURRENT_TIME()}',
    [Generator.CURRENT_DATETIME]: '${NOW()}',
    [Generator.CURRENT_TIMESTAMP]: '${CURRENT_TIMESTAMP}',
    [Generator.UUID]: '${uuid()}',
    [Generator.NOW]: '${NOW()}',
    [Generator.SYS_GUID]: '${SYS_GUID()}',
  },
};

export const SQLiteTranslatorConfig: TranslatorConfig = {
  quote: {
    column: '`',
    value: "'",
  },
  dataTypes: {
    'INT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'SMALLINT': 'INTEGER',
    'TINYINT': 'INTEGER',
    'SERIAL': 'INTEGER',
    'SMALLSERIAL': 'SMALLINT',
    'BIGSERIAL': 'BIGINT',
    'BIGINT': 'BIGINT',
    'BIT': 'BOOLEAN',
    'BOOLEAN': 'BOOLEAN',
    'BINARY': 'BOOLEAN',
    'REAL': 'REAL',
    'FLOAT': 'DOUBLE',
    'DOUBLE PRECISION': 'DOUBLE',
    'DOUBLE': 'DOUBLE',
    'NUMERIC': 'NUMERIC',
    'NUMBER': 'NUMERIC',
    'DECIMAL': 'DECIMAL',
    'MONEY': 'DECIMAL',
    'CHAR': 'CHARACTER',
    'CHARACTER': 'CHARACTER',
    'VARCHAR': 'VARCHAR',
    'NVARCHAR': 'VARCHAR',
    'NCHAR': 'CHARACTER',
    'CHARACTER VARYING': 'VARCHAR',
    'DATE': 'DATE',
    'TIME': 'TIME',
    'DATETIME': 'DATETIME',
    'TIMESTAMP': 'TIMESTAMP',
    'BYTEA': 'TEXT',
    'TEXT': 'TEXT',
    'UUID': 'VARCHAR',
    'JSON': 'TEXT',
    'ARRAY': 'TEXT',
    'ARRAY_STRING': 'TEXT',
    'ARRAY_INTEGER': 'TEXT',
    'ARRAY_BIGINT': 'TEXT',
    'ARRAY_DECIMAL': 'TEXT',
    'ARRAY_BOOLEAN': 'TEXT',
    'ARRAY_DATE': 'TEXT',
    'AUTO_INCREMENT': 'INTEGER',
  },
  generators: {
    [Generator.CURRENT_DATE]: "${DATE('now')}",
    [Generator.CURRENT_TIME]: "${TIME('now')}",
    [Generator.CURRENT_DATETIME]: "${datetime('now')}",
    [Generator.CURRENT_TIMESTAMP]: '${CURRENT_TIMESTAMP}',
    [Generator.UUID]: crypto.randomUUID,
    [Generator.NOW]: "${datetime('now')}",
    [Generator.SYS_GUID]: crypto.randomUUID,
  },
};
