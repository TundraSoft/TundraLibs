// Begin Core
export * as path from 'https://deno.land/std@0.193.0/path/mod.ts';
export * as fs from 'https://deno.land/std@0.193.0/fs/mod.ts';
export {
  format as dateFormat,
  parse as parseDate,
} from 'https://deno.land/std@0.193.0/datetime/mod.ts';
export {
  BufWriter,
  BufWriterSync,
} from 'https://deno.land/std@0.193.0/io/mod.ts';

export { printf, sprintf } from 'https://deno.land/std@0.193.0/fmt/printf.ts';
export * as yaml from 'https://deno.land/std@0.193.0/yaml/mod.ts';
export * as toml from 'https://deno.land/std@0.193.0/toml/mod.ts';
export * as base64url from 'https://deno.land/std@0.193.0/encoding/base64url.ts';
export * as base64 from 'https://deno.land/std@0.193.0/encoding/base64.ts';
export {
  blue,
  bold,
  brightGreen,
  brightRed,
  cyan,
  green,
  italic,
  magenta,
  red,
  underline,
  yellow,
} from 'https://deno.land/std@0.193.0/fmt/colors.ts';
// End Core

export {
  Client as PGClient,
  ConnectionError,
  Pool as PGPool,
  PostgresError,
  TransactionError,
} from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
export type { ClientOptions as PGClientOptions } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

export { DB as SQLiteClient } from 'https://deno.land/x/sqlite@v3.4.0/mod.ts';

export {
  Bson,
  MongoClient as MongoDBClient,
} from 'https://deno.land/x/mongo@v0.31.1/mod.ts';
export { Client as MySQL } from 'https://deno.land/x/mysql@v2.10.3/mod.ts';
export type { ClientConfig as MySQLClientConfig } from 'https://deno.land/x/mysql@v2.10.3/mod.ts';

// export { default as postgresjs } from "https://deno.land/x/postgresjs@v3.3.1/mod.js"
// export * as MySQLClient from "https://deno.land/x/mysql2@v1.0.5/mod.ts";
export { connect as RedisConnect } from 'https://deno.land/x/redis@v0.30.0/mod.ts';
export type { Redis } from 'https://deno.land/x/redis@v0.30.0/mod.ts';
export * as openpgp from 'https://cdn.skypack.dev/openpgp'; //'https://deno.land/x/openpgp@v5.9.0/src/index.js';

//#endregion norm

//#region Endpoint
export {
  createHttpError,
  // HttpError,
  isClientErrorStatus,
  isErrorStatus,
  isHttpError,
  isInformationalStatus,
  isRedirectStatus,
  isServerErrorStatus,
  isSuccessfulStatus,
  Status,
  STATUS_TEXT,
} from 'https://deno.land/std@0.193.0/http/mod.ts';

export type HTTPMethods =
  | 'HEAD'
  | 'OPTIONS'
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE';

export type {
  ClientErrorStatus,
  ErrorStatus,
  InformationalStatus,
  RedirectStatus,
  ServerErrorStatus,
  SuccessfulStatus,
} from 'https://deno.land/std@0.193.0/http/mod.ts';

export type {
  Middleware,
  RouterContext,
  RouterMiddleware,
} from 'https://deno.land/x/oak@v12.6.0/mod.ts';

export {
  Context,
  helpers as oakHelpers,
  Request,
  Response,
} from 'https://deno.land/x/oak@v12.6.0/mod.ts';

//#endregion Endpoint

//#region BigDecimal
export { BigDenary } from 'https://deno.land/x/bigdenary@1.0.0/mod.ts';
export type {
  BDNumberInput,
  BigDenaryRaw,
} from 'https://deno.land/x/bigdenary@1.0.0/mod.ts';
//#endregion BigDecimal
