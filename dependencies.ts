//#region Deno STD
export * as path from 'https://deno.land/std@0.205.0/path/posix/mod.ts';
export * as fs from 'https://deno.land/std@0.205.0/fs/mod.ts';
export {
  format as dateFormat,
  parse as parseDate,
} from 'https://deno.land/std@0.205.0/datetime/mod.ts';
export { printf, sprintf } from 'https://deno.land/std@0.205.0/fmt/printf.ts';

export * as yaml from 'https://deno.land/std@0.205.0/yaml/mod.ts';
export * as toml from 'https://deno.land/std@0.205.0/toml/mod.ts';
export * as base64 from 'https://deno.land/std@0.205.0/encoding/base64.ts';

export { Status, STATUS_TEXT } from 'https://deno.land/std@0.205.0/http/mod.ts';

//#endregion Deno STD
export type HTTPMethods =
  | 'HEAD'
  | 'OPTIONS'
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE';

//#region RESTler
export {
  parse as XMLParse,
  stringify as XMLStringify,
} from 'https://deno.land/x/xml@2.1.3/mod.ts';

//#endregion RESTler

//#region NORM
export {
  connect as RedisConnect,
  type Redis,
} from 'https://deno.land/x/redis@v0.30.0/mod.ts';

export {
  type ClientOptions as PGClientOptions,
  Pool as PGClient,
  PoolClient as PGPoolClient,
  PostgresError,
} from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

// export { default as PGClient } from 'https://deno.land/x/postgresjs@v3.4.3/mod.js';
export {
  Client as MariaDBClient,
  type ClientConfig as MariaDBClientConfig,
  type ExecuteResult as MariaDBResultSet,
} from 'https://deno.land/x/mysql@v2.12.1/mod.ts';

export {
  DB as SQLiteDBClient,
  SqliteError as SQLiteDBError,
  type SqliteOptions as SQLiteDBClientConfig,
} from 'https://deno.land/x/sqlite@v3.8/mod.ts';

// export { MongoClient } from 'npm:mongo';
// export { MongoClient as MongoDBClient, MongoServerError } from 'npm:mongodb';
// export type {
//   Collection as MongoCollection,
//   Db as MongoDB,
//   MongoClientOptions,
// } from 'npm:mongodb';

export {
  Collection as MongoCollection,
  type ConnectOptions as MongoClientOptions,
  Database as MongoDB,
  type Document as MongoDBDocument,
  MongoClient as MongoDBClient,
} from 'https://deno.land/x/mongo@v0.32.0/mod.ts';
export {
  MongoDriverError,
  MongoInvalidArgumentError,
  MongoRuntimeError,
  MongoServerError,
} from 'https://deno.land/x/mongo@v0.32.0/src/error.ts';

// For encryption
export * as openpgp from 'https://cdn.skypack.dev/openpgp'; //'https://deno.land/x/openpgp@v5.9.0/src/index.js';

//#endregion NORM
