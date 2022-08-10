import { AbstractClient } from "../AbstractClient.ts";
// import { QueryGenerator } from "../QueryGenerator.ts";

import type {
  // CountQueryOptions,
  // CreateTableOptions,
  DataType,
  // SelectQueryOptions,
  // UpdateQueryOptions,
  // DataTypeMap,
  // DataTypes,
  // DeleteQueryOptions,
  // Filters,
  // InsertQueryOptions,
  PostgresConfig,
  // QueryOptions,
  QueryType,
  SchemaDefinition,
} from "../types/mod.ts";

// const DataTypeMapString = {
//   "VARCHAR": "string",
//   "CHARACTER": "string",
//   "NVARCHAR": "string",
//   "TEXT": "string",
//   "STRING": "string",
//   "UUID": "string",
//   "GUID": "string",
//   "NUMERIC": "number",
//   "NUMBER": "number",
//   "DECIMAL": "number",
//   "INTEGER": "number",
//   "SMALLINT": "number",
//   "TINYINT": "number",
//   "FLOAT": "number",
//   "BIGINTEGER": "number",
//   "SERIAL": "number",
//   "BIGSERIAL": "number",
//   "AUTO_INCREMENT": "number",
//   "BOOLEAN": "boolean",
//   "BINARY": "boolean",
//   "DATE": "date",
//   "DATETIME": "date",
//   "TIME": "date",
//   "TIMESTAMP": "date",
//   "JSON": "object",
// };

import { PGPool } from "../../dependencies.ts";
import type { PGClientOptions } from "../../dependencies.ts";

export class Postgres<T extends PostgresConfig> extends AbstractClient<T> {
  declare protected _client: PGPool;
  // declare protected _queryGenerator: QueryGenerator;

  constructor(name: string, config: Partial<T>) {
    const configDefault: Partial<PostgresConfig> = {
      dialect: "POSTGRES",
      port: 5432,
      poolSize: 10,
    };
    super(name, config, configDefault as Partial<T>);
    // Ensure we have atleast > 1 connection available
    if (this._getOption("poolSize") < 1) {
      this._setOption("poolSize", 10);
    }
  }

  protected async _connect() {
    if (this._client === undefined) {
      const pgProps: PGClientOptions = {
        database: this._getOption("database"),
        password: this._getOption("password"),
        user: this._getOption("user"),
        port: this._getOption("port"),
        hostname: this._getOption("host"),
      };
      if (this._hasOption("tls")) {
        pgProps.tls = this._getOption("tls");
      }
      this._client = new PGPool(pgProps, this._getOption("poolSize"), true);
      // Hack to test the connection, if there is something wrong it will throw immediately
      await (await this._client.connect()).release();
    }
  }

  protected async _close() {
    if (this._client && this._client.available > 0) {
      await this._client.end();
    }
  }

  protected _getQueryType(sql: string): QueryType {
    const regEx = new RegExp(
        /^(CREATE|ALTER|DROP|TRUNCATE|SHOW|SELECT|INSERT|UPDATE|DELETE|DESC|DESCRIBE|EXPLAIN|BEGIN|COMMIT|ROLLBACK)?/i,
      ),
      match = sql.match(regEx);
    let qt: QueryType = "UNKNOWN";
    if (match && match.length > 0) {
      qt = match[0].trim().toUpperCase() as QueryType;
    }
    return qt;
  }

  protected async _query<T>(
    sql: string,
    queryArgs?: Record<string, unknown>,
  ): Promise<Array<T>> {
    const client = await this._client.connect();
    // Parse arguments only
    const res = await client.queryObject<T>({
      args: queryArgs,
      text: sql,
    });
    client.release();
    return res.rows;
  }

  protected async _execute(sql: string): Promise<void> {
    const client = await this._client.connect();
    await client.queryObject(sql);
    client.release();
  }

  protected async _getTableDefinition(
    table: string,
    schema?: string,
  ): Promise<SchemaDefinition> {
    // const filter = `C.table_name = ${this._quoteValue(table)}` +
    //   (schema ? `' AND C.table_schema = ${this._quoteValue(schema)}` : "");
    // const field_qry = `SELECT column_name,
    //                               ordinal_position,
    //                               data_type,
    //                               character_maximum_length,
    //                               numeric_precision,
    //                               numeric_scale,
    //                               is_nullable
    //                        FROM information_schema.columns C
    //                        WHERE ${filter}
    //                        ORDER BY ordinal_position`;
    // const constr_col_qry = `SELECT C.column_name,
    //                                    C.ordinal_position,
    //                                    C.constraint_name,
    //                                    U.constraint_type
    //                             FROM information_schema.key_column_usage C
    //                                      INNER JOIN
    //                                  information_schema.table_constraints U
    //                                  ON
    //                                      C.constraint_name = U.constraint_name
    //                             WHERE ${filter}
    //                             ORDER BY U.constraint_type, C.constraint_name, C.ordinal_position`;
    // console.log(field_qry);
    const conn = await this._client.connect();
    const fields_result = await conn.queryObject<{
      column_name: string;
      ordinal_position: number;
      data_type: string;
      character_maximum_length: number;
      numeric_precision: number;
      numeric_scale: number;
      is_nullable: boolean;
    }>(this._dialectHelper.getTableDefinition(table, schema));
    const dt_constraints = await conn.queryObject<{
      constraint_name: string;
      constraint_type: string;
      column_name: string;
      ordinal_position: number;
    }>(this._dialectHelper.getTableConstraints(table, schema));
    conn.release();

    const primary_keys = Object.fromEntries(
      dt_constraints.rows.filter((value) => {
        return value.constraint_type === "PRIMARY KEY";
      }).map((value) => {
        return [value.column_name, true];
      }),
    );
    const unique_keys = Object.fromEntries(
      Object.entries(
        dt_constraints.rows.filter((value) => {
          return value.constraint_type === "UNIQUE";
        }).reduce((acc, { column_name, constraint_name }) => {
          (acc[column_name] || (acc[column_name] = [])).push(constraint_name);
          return acc;
        }, {} as { [key: string]: string[] }),
      ).map(([key, value]) => [key, new Set(value)]),
    );

    const column_definitions = fields_result.rows.map((value) => {
      return {
        name: value.column_name,
        dataType: value.data_type.toUpperCase() as DataType,
        // length: (DataTypeMapString[value.data_type.toUpperCase() as DataType] ==
        //     "number")
        //   ? {
        //     precision: value.numeric_precision,
        //     scale: value.numeric_scale,
        //   }
        //   : ((DataTypeMapString[value.data_type.toUpperCase() as DataType] ==
        //       "string")
        //     ? value.character_maximum_length
        //     : undefined),
        length: (value.character_maximum_length > 0)
          ? value.character_maximum_length
          : {
            precision: value.numeric_precision,
            scale: value.numeric_scale,
          },
        isNullable: value.is_nullable,
        isPrimary: (primary_keys[value.column_name] === true),
        uniqueKey: unique_keys[value.column_name],
      };
    });
    return {
      table: table,
      schema: schema,
      columns: Object.fromEntries(column_definitions.map((value) => {
        return [value.name, value];
      })),
    };
  }
}
