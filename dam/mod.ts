export {
  assertClientOptions,
  assertDialect,
  assertMariaOptions,
  assertMongoOptions,
  assertPostgresOptions,
  assertSQLDialect,
  assertSQLiteOptions,
} from './asserts/mod.ts';

export {
  MariaClient,
  MongoClient,
  PostgresClient,
  SQLiteClient,
} from './client/mod.ts';

export {
  DAMClientConfigError,
  DAMClientConnectionError,
  DAMClientError,
  DAMClientMissingParamsError,
  DAMClientQueryError,
  DAMError,
} from './errors/mod.ts';

export type {
  ClientEvents,
  ClientOptions,
  ClientResult,
  ClientStatus,
  Dialects,
  MariaOptions,
  MongoOptions,
  PostgresOptions,
  SQLDialects,
  SQLiteOptions,
} from './types/mod.ts';
