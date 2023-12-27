export const MariaQueryTranslatorConfig = {
  escapeIdentifier: '`',
  cascade: {
    database: false,
    schema: false,
  },
  dataTypes: {
    'INT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'SMALLINT': 'SMALLINT',
    'TINYINT': 'TINYINT',
    'BIGINT': 'BIGINT',
    'REAL': 'REAL',
    'FLOAT': 'FLOAT',
    'DOUBLE PRECISION': 'DOUBLE',
    'DOUBLE': 'DOUBLE',
    'NUMERIC': 'DECIMAL',
    'NUMBER': 'DECIMAL',
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
    'TIME_Z': 'TIME',
    'DATETIME': 'DATETIME',
    'DATETIME_Z': 'DATETIME',
    'TIMESTAMP': 'TIMESTAMP',
    'TIMESTAMP_Z': 'TIMESTAMP',
    // Special
    'BLOB': 'BLOB',
    'UUID': 'UUID',
    'JSON': 'TEXT',
    'ARRAY': 'TEXT',
    'ARRAY_STRING': 'TEXT',
    'ARRAY_INTEGER': 'TEXT',
    'ARRAY_BIGINT': 'TEXT',
    'ARRAY_DECIMAL': 'TEXT',
    'ARRAY_BOOLEAN': 'TEXT',
    'ARRAY_DATE': 'TEXT',
    'ARRAY_DATE_Z': 'TEXT',
    'AUTO_INCREMENT': 'AUTO_INCREMENT',
    'SERIAL': 'AUTO_INCREMENT',
    'SMALLSERIAL': 'AUTO_INCREMENT',
    'BIGSERIAL': 'AUTO_INCREMENT',
  },
  supportsDistribution: false,
  supportsPartitioning: true,

  select(): string {
    /*
    SELECT posts.*, JSON_ARRAYAGG(JSON_OBJECT('name', comments.member_id, 'status', comments.status))
	FROM posts
		JOIN comments on (comments.post_id = posts.id)
	WHERE posts.Id = '6540dc164d08ff000113050f'
	LIMIT 1000;
    */
    return '';
  },
};
