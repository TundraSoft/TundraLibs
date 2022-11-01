export const enum QueryTypes {
  "CREATE" = "CREATE",
  "ALTER" = "ALTER",
  "DROP" = "DROP",
  "TRUNCATE" = "TRUNCATE",
  "SHOW" = "SHOW",
  "SELECT" = "SELECT",
  "COUNT" = "COUNT",
  "INSERT" = "INSERT",
  "UPDATE" = "UPDATE",
  "DELETE" = "DELETE",
  "MERGE" = "MERGE",
  "DESC" = "DESCRIBE",
  "DESCRIBE" = "DESCRIBE",
  "EXPLAIN" = "EXPLAIN",
  "BEGIN" = "BEGIN",
  "COMMIT" = "COMMIT",
  "ROLLBACK" = "ROLLBACK",
  "SAVEPOINT" = "SAVEPOINT", 
  "UNKNOWN" = "UNKNWON",
}

export type QueryType = keyof typeof QueryTypes;
