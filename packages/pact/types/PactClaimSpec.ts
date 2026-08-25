/**
 * @fileoverview Declarative OAuth claim extraction for `@tundralibs/pact`.
 *
 * A provider config's `claims` map declares the scope-dependent extras the
 * app wants (e.g. `birthdate`). The declaration drives BOTH ends: on
 * OIDC-speaking presets the names are merged into the `claims` request
 * parameter, and on callback the values are read from the raw payload,
 * sanitized, and attached as `profile.claims`.
 *
 * The cast set is deliberately CLOSED — this never grows into a
 * validation DSL. Anything richer (patterns, enums, cross-field rules)
 * belongs to `@tundralibs/guardian` at the app boundary.
 *
 * @module
 */

/**
 * One declared claim: a raw-payload key (string shorthand), or a spec
 * with an optional cast.
 *
 * Sanitation is fail-soft — a missing or uncastable claim is simply
 * ABSENT from `profile.claims`, never `null` and never a throw:
 *
 * - `STRING` (default): `String(v).trim()`; empty → absent
 * - `NUMBER`: finite number (numeric strings accepted)
 * - `BOOLEAN`: strictly `true`/`'true'` → `true`, `false`/`'false'` →
 *   `false`; anything else → absent
 * - `DATE`: parseable date (OIDC `birthdate` is `YYYY-MM-DD`) → `Date`
 */
export type PactClaimSpec = string | {
  /** Raw-payload key; dot-path for nested (e.g. `picture.data.url`). */
  from: string;
  /** Cast + sanitize rule. @default 'STRING' */
  type?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE';
};
