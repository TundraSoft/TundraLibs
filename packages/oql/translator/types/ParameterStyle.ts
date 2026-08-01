/**
 * Parameter placeholder style.
 *
 * - `'named'`: `:name` (SQLite, Oracle).
 * - `'positional'`: `?` (MySQL/MariaDB, also valid SQLite).
 * - `'numbered'`: `$N` (Postgres) or `?N` (SQLite alt).
 *
 * `prefix` is the leading character (`:`, `$`, `?`); `suffix` is
 * anything trailing (Postgres: empty; rare cases otherwise).
 */
export type ParameterStyle = {
  format: 'named' | 'positional' | 'numbered';
  prefix: string;
  suffix: string;
};
