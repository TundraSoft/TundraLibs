/**
 * @fileoverview Hrana `Stmt` — a single SQL statement with its bind arguments.
 *
 * @module
 */

import type { HranaValue } from './HranaValue.ts';
import type { HranaNamedArg } from './HranaNamedArg.ts';

/**
 * A single SQL statement in the Hrana wire protocol.
 *
 * `args` are positional bind values for `?` / `?NNN` placeholders (in order);
 * `named_args` bind `:name` / `@name` / `$name` placeholders. Both are arrays
 * of already-encoded {@link HranaValue}s — this client performs no JS→wire
 * value coercion. A statement may use positional args, named args, both, or
 * neither.
 *
 * Only the fields this client sends are modelled here (the spec also allows
 * `sql_id` for prepared statements and `want_rows` to suppress the row set,
 * neither of which the single-shot transport uses).
 *
 * Confirmed against the Hrana v3 spec's `Stmt` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaStmt = {
  /** SQL text, with `?`/`?NNN` and/or `:name`/`@name`/`$name` placeholders. */
  sql: string;

  /** Positional bind values, in order (`snake_case` on the wire). */
  args: readonly HranaValue[];

  /** Named bind values (`snake_case` on the wire). */
  named_args: readonly HranaNamedArg[];
};
