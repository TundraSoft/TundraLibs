/**
 * Index methods supported across database systems.
 *
 * - **BTREE**: B-Tree (default on most engines — PostgreSQL,
 *   MariaDB, MySQL, SQLite).
 * - **HASH**: Hash index — PostgreSQL, MariaDB, MySQL.
 * - **GIN**: Generalized Inverted Index — PostgreSQL (full-text,
 *   JSON, arrays).
 * - **GIST**: Generalized Search Tree — PostgreSQL (geometric data,
 *   full-text).
 * - **BRIN**: Block Range Index — PostgreSQL (very large tables).
 * - **FULLTEXT**: Full-text search — MariaDB, MySQL.
 */
export type IndexMethod =
  | 'BTREE'
  | 'HASH'
  | 'GIN'
  | 'GIST'
  | 'BRIN'
  | 'FULLTEXT';
