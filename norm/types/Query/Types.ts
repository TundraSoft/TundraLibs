export type QueryTypes =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'TRUNCATE'
  | 'CREATE'
  | 'DROP'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'ALTER_TABLE'
  | 'CREATE_VIEW'
  | 'DROP_VIEW'
  | 'ALTER_VIEW'
  | 'ALTER'
  | 'BEGIN'
  | 'COMMIT'
  | 'ROLLBACK'
  | 'SAVEPOINT'
  | 'TRANSACTION'
  | 'UNKNOWN';
