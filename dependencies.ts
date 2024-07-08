//#region Deno STD
export * as semver from 'https://deno.land/std@0.224.0/semver/mod.ts';
export * as path from 'https://deno.land/std@0.224.0/path/posix/mod.ts';
export * as fs from 'https://deno.land/std@0.224.0/fs/mod.ts';

export {
  format as dateFormat,
  parse as parseDate,
} from 'https://deno.land/std@0.224.0/datetime/mod.ts';
export { printf, sprintf } from 'https://deno.land/std@0.224.0/fmt/printf.ts';

export * as yaml from 'https://deno.land/std@0.224.0/yaml/mod.ts';
export * as toml from 'https://deno.land/std@0.224.0/toml/mod.ts';
export * as base64 from 'https://deno.land/std@0.224.0/encoding/base64.ts';
export * as hex from 'https://deno.land/std@0.224.0/encoding/hex.ts';

export {
  STATUS_TEXT,
  type StatusCode,
} from 'https://deno.land/std@0.224.0/http/status.ts';

//#endregion Deno STD
//#region RESTler
export {
  parse as XMLParse,
  stringify as XMLStringify,
} from 'https://deno.land/x/xml@4.0.0/mod.ts';

//#endregion RESTler

//#region NORM
export {
  connect as RedisConnect,
  type Redis,
} from 'https://deno.land/x/redis@v0.32.3/mod.ts';

export {
  type ClientOptions as PGClientOptions,
  Pool as PGClient,
  PoolClient as PGPoolClient,
  PostgresError,
} from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

// export {
//   createPool as MariaDBPoolConnector,
//   type Pool as MariaDBPool,
//   type PoolConfig as MariaDBClientConfig,
//   type PoolConnection as MariaDBPoolConnection,
//   SqlError as MariaDBError,
// } from 'npm:mariadb';

export {
  Client as MySQLClient,
  type ClientConfig as MySQLClientConfig,
  Connection as MySQLConnection,
  type ExecuteResult as MySQLExecuteResult,
  type TLSConfig as MySQLTLSConfig,
  TLSMode as MySQLTLSMode,
} from 'https://deno.land/x/mysql@v2.12.1/mod.ts';

export {
  DB as SQLiteDBClient,
  SqliteError as SQLiteDBError,
  type SqliteOptions as SQLiteDBClientConfig,
} from 'https://deno.land/x/sqlite@v3.8/mod.ts';

export {
  Collection as MongoDBCollection,
  type ConnectOptions as MongoDBClientOptions,
  Database as MongoDBDatabase,
  type Document as MongoDBDocument,
  GridFSBucket as MongoDBGridBucket,
  MongoClient as MongoDBClient,
  ObjectId as MongoDBObjectId,
} from 'https://deno.land/x/mongo@v0.33.0/mod.ts';

// export {
//   type Collection,
//   type Db,
//   MongoClient as MongoDBClient,
//   type MongoClientOptions as MongoDBClientOptions,
//   MongoServerError as MongoDBServerError,
// } from 'npm:mongodb';

// For encryption
export * as openpgp from 'https://cdn.skypack.dev/openpgp'; //'https://deno.land/x/openpgp@v5.11.1/src/index.js'; //'https://cdn.skypack.dev/openpgp';

//#endregion NORM
