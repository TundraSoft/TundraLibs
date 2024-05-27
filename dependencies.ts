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
  STATUS_CODE,
  STATUS_TEXT,
} from 'https://deno.land/std@0.224.0/http/status.ts';

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

export {
  createPool as MariaDBPoolConnector,
  type Pool as MariaDBPool,
  type PoolConfig as MariaDBClientConfig,
  type PoolConnection as MariaDBPoolConnection,
  SqlError as MariaDBError,
} from 'npm:mariadb';

export {
  DB as SQLiteDBClient,
  SqliteError as SQLiteDBError,
  type SqliteOptions as SQLiteDBClientConfig,
} from 'https://deno.land/x/sqlite@v3.8/mod.ts';

export {
  type Collection,
  type Db,
  MongoClient as MongoDBClient,
  type MongoClientOptions as MongoDBClientOptions,
  MongoServerError as MongoDBServerError,
} from 'npm:mongodb';

// For encryption
export * as openpgp from 'https://cdn.skypack.dev/openpgp'; //'https://deno.land/x/openpgp@v5.11.1/src/index.js'; //'https://cdn.skypack.dev/openpgp';

//#endregion NORM
