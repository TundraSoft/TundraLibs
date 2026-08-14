/**
 * @fileoverview Object Query Language (OQL) — Type-safe database queries.
 *
 * OQL provides a comprehensive type system for defining database queries that
 * can be validated at compile-time and runtime, then translated to native
 * SQL or NoSQL queries.
 *
 * @module oql
 *
 * @example Basic SELECT query
 * ```typescript
 * import type { Query } from '@tundralibs/oql';
 * import { assertSelect } from '@tundralibs/oql/asserts';
 * import { PostgresTranslator } from '@tundralibs/oql/translator';
 *
 * type User = { id: number; email: string; age: number };
 *
 * const query: Query<'SELECT', User> = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'email', 'age'],
 *   projection: { '@id': true, '@email': true },
 *   where: { '@age': { $gte: 18 } },
 * };
 *
 * // Validate (throws TypeError on invalid input)
 * assertSelect(query);
 *
 * // Translate
 * const translator = new PostgresTranslator();
 * const { sql, params } = translator.select(query);
 * ```
 *
 * @example INSERT with expressions
 * ```typescript
 * import type { Query } from '@tundralibs/oql';
 *
 * type Order = { userId: number; total: number; createdAt: Date };
 *
 * const query: Query<'INSERT', Order> = {
 *   type: 'INSERT',
 *   table: 'orders',
 *   columns: ['userId', 'total', 'createdAt'],
 *   data: {
 *     userId: 123,
 *     total: 99.99,
 *     createdAt: { $$_expression: 'NOW' },
 *   },
 * };
 * ```
 */

export type * from './types/mod.ts';
export * from './asserts/mod.ts';
export * from './errors/mod.ts';
export * from './translator/mod.ts';
