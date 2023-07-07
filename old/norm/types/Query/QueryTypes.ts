export const enum QueryTypes {
  SELECT = 'SELECT',
  COUNT = 'COUNT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CREATE = 'CREATE',
  CREATE_SCHEMA = 'CREATE_SCHEMA',
  CREATE_TABLE = 'CREATE_TABLE',
  ALTER = 'ALTER',
  DROP = 'DROP',
  DROP_SCHEMA = 'DROP_SCHEMA',
  DROP_TABLE = 'DROP_TABLE',
  TRUNCATE = 'TRUNCATE',
  // Transaction
  BEGIN = 'BEGIN',
  COMMIT = 'COMMIT',
  ROLLBACK = 'ROLLBACK',
  SAVEPOINT = 'SAVEPOINT',
  // Misc
  SHOW = 'SHOW',
  DESCRIBE = 'DESCRIBE',
  DESC = 'DESCRIBE',
  EXPLAIN = 'EXPLAIN',
  // Internal - Used in norm
  RAW = 'RAW', //-- Internal
  // Unknown
  UNKNOWN = 'UNKNOWN',
}

export type QueryType = keyof typeof QueryTypes;
