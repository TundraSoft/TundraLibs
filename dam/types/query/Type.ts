export type QueryType =
  | 'SELECT'
  | 'COUNT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'TRUNCATE'
  | 'CREATE_SCHEMA'
  | 'DROP_SCHEMA'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'ALTER_TABLE'
  | 'RENAME_TABLE'
  | 'CREATE_VIEW'
  | 'DROP_VIEW'
  | 'ALTER_VIEW'
  | 'RENAME_VIEW'
  | 'BEGIN'
  | 'SAVEPOINT'
  | 'COMMIT'
  | 'ROLLBACK'
  | 'UNKNOWN';
