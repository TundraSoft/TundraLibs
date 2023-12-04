export const PostgresQueryTranslatorConfig = {
  escapeIdentifier: '"',
  dataTypes: {
    'INT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'SMALLINT': 'INTEGER',
    'TINYINT': 'INTEGER',
    'BIGINT': 'BIGINT',
    'REAL': 'REAL',
    'FLOAT': 'FLOAT',
    'DOUBLE PRECISION': 'DOUBLE',
    'DOUBLE': 'DOUBLE',
    'NUMERIC': 'NUMERIC',
    'NUMBER': 'NUMERIC',
    'DECIMAL': 'DECIMAL',
    'MONEY': 'DECIMAL',
    // Boolean
    'BIT': 'BOOLEAN',
    'BOOLEAN': 'BOOLEAN',
    'BINARY': 'BOOLEAN',
    // String
    'CHAR': 'CHAR',
    'CHARACTER': 'CHAR',
    'VARCHAR': 'VARCHAR',
    'NVARCHAR': 'VARCHAR',
    'NCHAR': 'CHAR',
    'CHARACTER VARYING': 'VARCHAR',
    'TEXT': 'TEXT',
    // Date & Time
    'DATE': 'DATE',
    'DATE_Z': 'DATE',
    'TIME': 'TIME',
    'TIME_Z': 'TIMEZ',
    'DATETIME': 'DATETIME',
    'DATETIME_Z': 'DATETIMEZ',
    'TIMESTAMP': 'TIMESTAMP',
    'TIMESTAMP_Z': 'TIMESTAMPZ',
    // Special
    'BLOB': 'BLOB',
    'UUID': 'UUID',
    'JSON': 'JSON',
    'ARRAY': 'VARCHAR[]',
    'ARRAY_STRING': 'VARCHAR[]',
    'ARRAY_INTEGER': 'INTEGER[]',
    'ARRAY_BIGINT': 'BIGINT[]',
    'ARRAY_DECIMAL': 'DECIMAL[]',
    'ARRAY_BOOLEAN': 'BOOLEAN[]',
    'ARRAY_DATE': 'DATE[]',
    'ARRAY_DATE_Z': 'DATEZ[]',
    'AUTO_INCREMENT': 'SERIAL',
    'SERIAL': 'SERIAL',
    'SMALLSERIAL': 'SMALLSERIAL',
    'BIGSERIAL': 'BIGSERIAL',
  },
};
