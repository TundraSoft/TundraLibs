/**
 * JSON-Path Filter Helpers
 *
 * A filter key of the form `@col.@key` (or deeper, `@col.@a.@b`) whose FIRST
 * segment names a declared column of the base table is a **JSON path
 * extraction** — the translators emit the dialect's JSON accessor
 * (`"col"->>'key'`, `json_extract("col", '$.key')`, …) as the predicate's
 * left-hand side. The same `@a.@b` syntax also spells join-alias / base-table
 * qualification, so resolution is by precedence — join alias first, base
 * table name second, declared column (JSON path) third — and the JSON-path
 * interpretation only fires where the key would previously have been
 * rejected.
 *
 * Extraction yields TEXT on Postgres / MariaDB but natively-typed values on
 * SQLite, so the ordered comparison operators (`$gt`, `$gte`, `$lt`, `$lte`,
 * `$between`) would silently compare differently per dialect. v1 therefore
 * restricts JSON-path keys to {@link JSON_PATH_ALLOWED_OPERATORS}; both the
 * asserts layer and the translators enforce the same set through the helpers
 * here.
 *
 * @module asserts/Filters/JsonPath
 */

import { isColumnIdentifier } from '../columnIdentifier.ts';

/**
 * Operators a JSON-path filter key (`@col.@key`) accepts in v1: equality,
 * null tests, set membership, and the string/LIKE family. The ordered
 * comparison operators (`$gt`, `$gte`, `$lt`, `$lte`, `$between`) are
 * deliberately absent — JSON extraction yields text on Postgres/MariaDB but
 * native types on SQLite, so numeric range predicates would silently differ
 * per dialect.
 */
export const JSON_PATH_ALLOWED_OPERATORS: ReadonlySet<string> = new Set([
  '$eq',
  '$ne',
  '$null',
  '$in',
  '$nin',
  '$like',
  '$nlike',
  '$ilike',
  '$nilike',
  '$startsWith',
  '$endsWith',
  '$contains',
]);

/**
 * Returns the first operator key in `rhs` that is NOT allowed on a
 * JSON-path filter key, or `null` when the whole RHS is acceptable.
 *
 * Direct-value forms — `null` (IS NULL), a scalar (implicit `$eq`), an
 * array (implicit `$in`) — always pass: they desugar to allowed operators.
 * Only an operator object is inspected, and every key must be in
 * {@link JSON_PATH_ALLOWED_OPERATORS}.
 *
 * Shared by the asserts layer (which wraps the offender in a `TypeError`)
 * and the translators (which raise an `OqlError` with code
 * `JSON_PATH_UNSUPPORTED_OPERATOR`), so the two layers cannot drift.
 */
export const findDisallowedJsonPathOperator = (
  rhs: unknown,
): string | null => {
  if (
    rhs === null || typeof rhs !== 'object' || rhs instanceof Date ||
    Array.isArray(rhs)
  ) {
    return null;
  }
  for (const op of Object.keys(rhs)) {
    if (!JSON_PATH_ALLOWED_OPERATORS.has(op)) return op;
  }
  return null;
};

/**
 * Resolve the JSON-path root of a filter key: when `key` is a
 * syntactically valid multi-segment column identifier (`@a.@b`, `@a.@b.@c`,
 * …) whose FIRST segment names an entry of `roots` (the declared base-table
 * columns eligible as JSON-path roots), returns that first segment;
 * otherwise `null`.
 *
 * Callers apply this only AFTER exact-name resolution has failed, so the
 * join-alias / qualified-column interpretation always wins over the
 * JSON-path one. `roots` should already exclude join aliases and the base
 * table name — the query-level asserts build it that way — which keeps the
 * asserts-layer precedence identical to the translators'.
 */
export const jsonPathRootOf = (
  key: unknown,
  roots: string[] | undefined,
): string | null => {
  if (roots === undefined || roots.length === 0) return null;
  if (typeof key !== 'string') return null;
  // Syntax-only check — every segment `@`-prefixed and identifier-shaped.
  if (!isColumnIdentifier(key)) return null;
  const parts = key.split('.');
  if (parts.length < 2) return null;
  const first = parts[0]!.slice(1);
  return roots.includes(first) ? first : null;
};
