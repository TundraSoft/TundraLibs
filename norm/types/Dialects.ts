export const enum Dialect {
  POSTGRES = 'POSTGRES',
  MYSQL = 'MYSQL',
  SQLITE = 'SQLITE',
  MARIADB = 'MARIADB',
  // MSSQL = "MSSQL",
  MONGODB = 'MONGODB',
}

export type Dialects = keyof typeof Dialect;

// Path: norm3\types\QueryBuilder.ts
