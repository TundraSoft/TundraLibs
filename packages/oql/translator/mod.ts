/**
 * @fileoverview SQL and NoSQL Query Translators
 *
 * Translators convert OQL Query ASTs into native database queries.
 * Each translator implements database-specific syntax, operators, and features
 * while maintaining a consistent API.
 *
 * @module translator
 *
 * @example PostgreSQL translation
 * ```typescript
 * import { PostgresTranslator } from '@tundralibs/oql/translator';
 *
 * const translator = new PostgresTranslator();
 * const query = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'email', 'age'],
 *   projection: { '@id': true, '@email': true },
 *   where: { '@age': { $gte: 18 } },
 * };
 *
 * const { sql, params } = translator.select(query);
 * // sql: SELECT "id" AS "id", "email" AS "email" FROM "users" WHERE "age" >= :p_0:
 * // params: { p_0: 18 }
 * ```
 *
 * @example MongoDB translation
 * ```typescript
 * import { MongoTranslator } from '@tundralibs/oql/translator';
 *
 * const translator = new MongoTranslator();
 * const action = translator.select(query);
 * // {
 * //   type: 'find',
 * //   collection: 'users',
 * //   filter: { age: { $gte: 18 } },
 * //   projection: { id: 1, email: 1, _id: 0 }
 * // }
 * ```
 *
 * @example Using Parameters
 * ```typescript
 * import { Parameters } from '@tundralibs/oql/translator';
 *
 * const params = new Parameters();
 * const name = params.add(18);      // Returns the param NAME 'p_0'
 *                                   // (the ':p_0:' placeholder is produced
 *                                   //  later by the translator's _parameterize)
 * const record = params.asRecord(); // { p_0: 18 }
 * ```
 */

export { AbstractTranslator } from './AbstractTranslator.ts';
export {
  DialectUnsupportedError,
  OqlError,
  type OqlErrorCode,
  OqlErrorCodes,
  type OqlErrorMeta,
} from '../errors/mod.ts';
export { Parameters } from './Parameters.ts';
export { SQLiteTranslator } from './SQLiteTranslator.ts';
export { PostgresTranslator } from './PostgresTranslator.ts';
export { MariaTranslator } from './MariaTranslator.ts';
export { MongoTranslator } from './MongoTranslator.ts';
export type {
  MongoAction,
  MongoAggregateAction,
  MongoBulkUpsertOp,
  MongoBulkWriteAction,
  MongoCountAction,
  MongoCreateCollectionAction,
  MongoCreateIndexAction,
  MongoCreateViewAction,
  MongoDeleteAction,
  MongoDropAction,
  MongoDropDatabaseAction,
  MongoDropIndexAction,
  MongoFindAction,
  MongoInsertAction,
  MongoNoopAction,
  MongoRenameCollectionAction,
  MongoUpdateAction,
} from './MongoTranslator.ts';
export type {
  AggregateEmitter,
  AggregateMap,
  DialectSupport,
  ExpressionEmitter,
  ExpressionMap,
  FilterOperatorEmitter,
  FilterOperatorMap,
  IdentifierQuote,
  ParameterStyle,
  TranslatedQuery,
} from './types/mod.ts';
