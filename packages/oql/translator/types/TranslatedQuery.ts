/**
 * The output shape every translator produces.
 *
 * For SQL translators `sql` is the SQL string and `params` is a
 * `{ p_0: 18, p_1: 'John' }`-style map. For non-SQL translators
 * (e.g. Mongo) `sql` is the operation name (`'find'`, `'insert'`, …)
 * and `params` is the operation body (filter, document, pipeline, …).
 */
export type TranslatedQuery = {
  sql: string;
  params: Record<string, unknown>;
};
