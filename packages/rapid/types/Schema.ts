/**
 * @fileoverview {@link RapidSchema} — the structural shape of a validation
 * schema rapid can both RUN (`parse`) and DOCUMENT (`toOpenAPI` /
 * `toJSONSchema`). A `@tundralibs/guardian` schema satisfies it; rapid takes
 * no dependency on guardian for this.
 *
 * @module
 */

/**
 * A validator that can also describe itself. `parse` returns the typed value
 * (or throws — a guardian failure maps to a 400 automatically); the two
 * optional emitters are what `buildOpenApi` reads. Method syntax on purpose:
 * method bivariance lets a `RapidSchema<User>` sit where `RapidSchema`
 * (unknown) is expected.
 */
export type RapidSchema<T = unknown> = {
  parse(value: unknown): T | Promise<T>;
  toOpenAPI?(): unknown;
  toJSONSchema?(): unknown;
};
