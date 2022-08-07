import { type } from "../../guardian/mod.ts";

export const enum DataTypes {
  "VARCHAR" = "VARCHAR",
  "CHARACTER VARYING" = "VARCHAR",
  "CHARACTER" = "CHARACTER",
  "CHAR" = "CHARACTER",
  "NVARCHAR" = "VARCHAR",
  "TEXT" = "TEXT",
  "STRING" = "STRING",
  "UUID" = "UUID",
  "GUID" = "GUID",
  "NUMERIC" = "NUMERIC",
  "NUMBER" = "NUMBER",
  "DECIMAL" = "DECIMAL",
  "INTEGER" = "INTEGER",
  "SMALLINT" = "SMALLINT",
  "TINYINT" = "TINYINT",
  "FLOAT" = "FLOAT",
  "BIGINTEGER" = "BIGINTEGER",
  "SERIAL" = "SERIAL",
  "BIGSERIAL" = "BIGSERIAL",
  "AUTO_INCREMENT" = "AUTO_INCREMENT",
  "BOOLEAN" = "BOOLEAN",
  "BINARY" = "BINARY",
  "DATE" = "DATE",
  "DATETIME" = "DATETIME",
  "TIME" = "TIME",
  "TIMESTAMP" = "TIMESTAMP",
  "JSON" = "JSON",
}

export const DataTypeMap = {
  "VARCHAR": type("string"),
  "CHARACTER VARYING": type("string"),
  "CHARACTER": type("string"),
  "CHAR": type("string"),
  "NVARCHAR": type("string"),
  "TEXT": type("string"),
  "STRING": type("string"),
  "UUID": type("string"),
  "GUID": type("string"),
  "NUMERIC": type("number"),
  "NUMBER": type("number"),
  "DECIMAL": type("number"),
  "INTEGER": type("number"),
  "SMALLINT": type("number"),
  "TINYINT": type("number"),
  "FLOAT": type("number"),
  "BIGINTEGER": type("number"),
  "SERIAL": type("number"),
  "BIGSERIAL": type("number"),
  "AUTO_INCREMENT": type("number"),
  "BOOLEAN": type("boolean"),
  "BINARY": type("boolean"),
  "DATE": type("date"),
  "DATETIME": type("date"),
  "TIME": type("date"),
  "TIMESTAMP": type("date"),
  "JSON": type("object"),
};

export type DataType = keyof typeof DataTypes;
