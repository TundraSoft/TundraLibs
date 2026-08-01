/**
 * @fileoverview Hrana `NamedArg` — a single named bind argument.
 *
 * @module
 */

import type { HranaValue } from './HranaValue.ts';

/**
 * A named bind argument for a {@link HranaStmt}, pairing a placeholder `name`
 * with its already-encoded {@link HranaValue}.
 *
 * The `name` is the placeholder identifier **without** its SQL sigil — the
 * server matches it against `:name`, `@name`, and `$name` placeholders alike.
 *
 * Confirmed against the Hrana v3 spec's `NamedArg` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaNamedArg = {
  /** Placeholder name, without the leading `:` / `@` / `$` sigil. */
  name: string;

  /** The bind value, already encoded as a {@link HranaValue}. */
  value: HranaValue;
};
