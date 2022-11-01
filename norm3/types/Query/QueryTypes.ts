export const enum QueryTypes {
  SELECT = "SELECT",
  COUNT = "COUNT",
  INSERT = "INSERT",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  RAW = "RAW",
  TRUNCATE = "TRUNCATE",
}

export type QueryType = keyof typeof QueryTypes;
