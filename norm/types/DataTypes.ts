import { array, Guardian, type } from "../../guardian/mod.ts";

export const enum DataTypes {
  "INT" = "INT",
  "INTEGER" = "INTEGER",
  "SMALLINT" = "SMALLINT",
  "TINYINT" = "TINYINT",
  "SERIAL" = "SERIAL",
  "SMALLSERIAL" = "SMALLSERIAL",
  "BIGSERIAL" = "BIGSERIAL",
  "BIGINT" = "BIGINT",
  "BIT" = "BIT",
  "BOOLEAN" = "BOOLEAN",
  "BINARY" = "BINARY",
  "REAL" = "REAL",
  "FLOAT" = "FLOAT",
  "DOUBLE PRECISION" = "DOUBLE PRECISION",
  "NUMERIC" = "NUMERIC",
  "NUMBER" = "NUMBER",
  "DECIMAL" = "DECIMAL",
  "MONEY" = "MONEY",
  "CHAR" = "CHAR",
  "CHARACTER" = "CHARACTER",
  "VARCHAR" = "VARCHAR",
  "NVARCHAR" = "NVARCHAR",
  "NCHAR" = "NCHAR",
  "CHARACTER VARYING" = "CHARACTER VARYING",
  "DATE" = "DATE",
  "TIME" = "TIME",
  "DATETIME" = "DATETIME",
  "TIMESTAMP" = "TIMESTAMP",
  "BYTEA" = "BYTEA",
  "TEXT" = "TEXT",
  "UUID" = "UUID",
  "JSON" = "JSON",
  "ARRAY" = "ARRAY",
  "AUTO_INCREMENT" = "AUTO_INCREMENT",
}

export type DataType = keyof typeof DataTypes;

export const DataTypeMap = {
  "INT": type("number"),
  "INTEGER": type("number"),
  "SMALLINT": type("number"),
  "TINYINT": type("number"),
  "SERIAL": type("number"),
  "SMALLSERIAL": type("number"),
  "BIGSERIAL": type("number"),
  "BIGINT": type("number"),
  "BIT": type("boolean"),
  "BOOLEAN": type("boolean"),
  "BINARY": type("boolean"),
  "REAL": type("number"),
  "FLOAT": type("number"),
  "DOUBLE PRECISION": type("number"),
  "NUMERIC": type("number"),
  "NUMBER": type("number"),
  "DECIMAL": type("number"),
  "MONEY": type("number"),
  "CHAR": type("string"),
  "CHARACTER": type("string"),
  "VARCHAR": type("string"),
  "NVARCHAR": type("string"),
  "NCHAR": type("string"),
  "CHARACTER VARYING": type("string"),
  "DATE": type("date"),
  "TIME": type("date"),
  "DATETIME": type("date"),
  "TIMESTAMP": type("date"),
  "BYTEA": type("string"),
  "TEXT": type("string"),
  "UUID": type("string"),
  "JSON": type("object"),
  "ARRAY": array(),
  "AUTO_INCREMENT": type("number"),
};

export const DefaultValidator = {
  "INT": Guardian.number().integer(),
  "INTEGER": Guardian.number().integer(),
  "SMALLINT": Guardian.number().integer(),
  "TINYINT": Guardian.number().integer(),
  "SERIAL": Guardian.number().integer(),
  "SMALLSERIAL": Guardian.number().integer(),
  "BIGSERIAL": Guardian.bigint(),
  "BIGINT": Guardian.bigint(),
  "BIT": Guardian.boolean(),
  "BOOLEAN": Guardian.boolean(),
  "BINARY": Guardian.boolean(),
  "REAL": Guardian.number(),
  "FLOAT": Guardian.number(),
  "DOUBLE PRECISION": Guardian.number(),
  "NUMERIC": Guardian.number(),
  "NUMBER": Guardian.number(),
  "DECIMAL": Guardian.number(),
  "MONEY": Guardian.number(),
  "CHAR": Guardian.string(),
  "CHARACTER": Guardian.string(),
  "VARCHAR": Guardian.string(),
  "NVARCHAR": Guardian.string(),
  "NCHAR": Guardian.string(),
  "CHARACTER VARYING": Guardian.string(),
  "DATE": Guardian.date(),
  "TIME": Guardian.date(),
  "DATETIME": Guardian.date(),
  "TIMESTAMP": Guardian.date(),
  "BYTEA": Guardian.string(),
  "TEXT": Guardian.string(),
  "UUID": Guardian.string().uuid(),
  "JSON": Guardian.object(),
  "ARRAY": Guardian.array(),
  "AUTO_INCREMENT": Guardian.number().integer(),
};

export const PostgresDataMap = {
  "INT": "INTEGER",
  "INTEGER": "INTEGER",
  "SMALLINT": "INTEGER",
  "TINYINT": "INTEGER",
  "SERIAL": "SERIAL",
  "SMALLSERIAL": "SMALLSERIAL",
  "BIGSERIAL": "BIGSERIAL",
  "BIGINT": "BIGINT",
  "BIT": "BOOLEAN",
  "BOOLEAN": "BOOLEAN",
  "BINARY": "BOOLEAN",
  "REAL": "REAL",
  "FLOAT": "DOUBLE",
  "DOUBLE PRECISION": "DOUBLE",
  "NUMERIC": "NUMERIC",
  "NUMBER": "NUMERIC",
  "DECIMAL": "DECIMAL",
  "MONEY": "DECIMAL",
  "CHAR": "CHARACTER",
  "CHARACTER": "CHARACTER",
  "VARCHAR": "VARCHAR",
  "NVARCHAR": "VARCHAR",
  "NCHAR": "CHARACTER",
  "CHARACTER VARYING": "VARCHAR",
  "DATE": "DATE",
  "TIME": "TIME",
  "DATETIME": "DATETIME",
  "TIMESTAMP": "TIMESTAMP",
  "BYTEA": "BYTEA",
  "TEXT": "TEXT",
  "UUID": "UUID",
  "JSON": "JSON",
  "ARRAY": "ARRAY",
  "AUTO_INCREMENT": "SERIAL",
};

export const SqliteDataMap = {
  "INT": "INTEGER",
  "INTEGER": "INTEGER",
  "SMALLINT": "INTEGER",
  "TINYINT": "INTEGER",
  "SERIAL": "INTEGER",
  "SMALLSERIAL": "SMALLINT",
  "BIGSERIAL": "BIGINT",
  "BIGINT": "BIGINT",
  "BIT": "BOOLEAN",
  "BOOLEAN": "BOOLEAN",
  "BINARY": "BOOLEAN",
  "REAL": "REAL",
  "FLOAT": "DOUBLE",
  "DOUBLE PRECISION": "DOUBLE",
  "NUMERIC": "NUMERIC",
  "NUMBER": "NUMERIC",
  "DECIMAL": "DECIMAL",
  "MONEY": "DECIMAL",
  "CHAR": "CHARACTER",
  "CHARACTER": "CHARACTER",
  "VARCHAR": "VARCHAR",
  "NVARCHAR": "VARCHAR",
  "NCHAR": "CHARACTER",
  "CHARACTER VARYING": "VARCHAR",
  "DATE": "DATE",
  "TIME": "TIME",
  "DATETIME": "DATETIME",
  "TIMESTAMP": "TIMESTAMP",
  "BYTEA": "TEXT",
  "TEXT": "TEXT",
  "UUID": "VARCHAR",
  "JSON": "TEXT",
  "ARRAY": "TEXT",
  "AUTO_INCREMENT": "INTEGER",
};

export const MySQLDataMap = {
  "INT": "INTEGER",
  "INTEGER": "INTEGER",
  "SMALLINT": "INTEGER",
  "TINYINT": "INTEGER",
  "SERIAL": "AUTO_INCREMENT",
  "SMALLSERIAL": "AUTO_INCREMENT",
  "BIGSERIAL": "AUTO_INCREMENT",
  "BIGINT": "BIGINT",
  "BIT": "BOOLEAN",
  "BOOLEAN": "BOOLEAN",
  "BINARY": "BOOLEAN",
  "REAL": "REAL",
  "FLOAT": "DOUBLE",
  "DOUBLE PRECISION": "DOUBLE",
  "NUMERIC": "NUMERIC",
  "NUMBER": "NUMERIC",
  "DECIMAL": "DECIMAL",
  "MONEY": "DECIMAL",
  "CHAR": "CHARACTER",
  "CHARACTER": "CHARACTER",
  "VARCHAR": "VARCHAR",
  "NVARCHAR": "VARCHAR",
  "NCHAR": "CHARACTER",
  "CHARACTER VARYING": "VARCHAR",
  "DATE": "DATE",
  "TIME": "TIME",
  "DATETIME": "DATETIME",
  "TIMESTAMP": "TIMESTAMP",
  "BYTEA": "TEXT",
  "TEXT": "TEXT",
  "UUID": "UUID",
  "JSON": "TEXT",
  "ARRAY": "TEXT",
  "AUTO_INCREMENT": "AUTO_INCREMENT",
};
